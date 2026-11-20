import { ERRORS } from '@contract/constants';

import { Injectable, Logger } from '@nestjs/common';

import { GetNetworkAddressesCommand } from '@remnawave/node-contract';

import { AxiosService } from '@common/axios';
import { fail, ok, TResult } from '@common/types';

import { NodesEntity } from './entities';
import { NodeResponseModel } from './models';
import {
    NodeControlAddressLimitError,
    NodeControlRevisionConflictError,
} from './node-control-addresses';
import { NODE_IP_SCAN_INTERVAL_MS } from './node-ip-inventory.constants';
import { NodesSystemCacheService } from './nodes-system-cache.service';
import { NodesRepository } from './repositories/nodes.repository';

@Injectable()
export class NodeIpInventoryService {
    private readonly logger = new Logger(NodeIpInventoryService.name);
    private readonly pending = new Map<string, Promise<TResult<NodesEntity>>>();
    private readonly retryAt = new Map<string, number>();

    constructor(
        private readonly nodes: NodesRepository,
        private readonly axios: AxiosService,
        private readonly systemCache: NodesSystemCacheService,
    ) {}

    private failure(error: unknown) {
        if (error instanceof NodeControlRevisionConflictError)
            return fail(ERRORS.NODE_CONTROL_REVISION_CONFLICT);
        if (error instanceof NodeControlAddressLimitError)
            return fail(ERRORS.NODE_CONTROL_ADDRESS_LIMIT);
        this.logger.warn('Node address discovery failed; saved addresses were retained');
        return fail(ERRORS.NODE_IP_SCAN_UNAVAILABLE);
    }

    async rescan(uuid: string, controlRevision: string): Promise<TResult<NodeResponseModel>> {
        try {
            const node = await this.nodes.findByUUID(uuid);
            if (!node) return fail(ERRORS.NODE_NOT_FOUND);
            if (node.controlRevision !== controlRevision)
                return fail(ERRORS.NODE_CONTROL_REVISION_CONFLICT);
            if (node.isDisabled || !node.controlAddresses.some((row) => row.enabled))
                return fail(ERRORS.NODE_IP_SCAN_DISABLED);
            const result = await this.scanOnce(node, 'refresh');
            if (!result.isOk) return result;
            const cache = await this.systemCache.getOne(uuid).catch(() => ({
                system: null,
                versions: null,
                xrayUptime: 0,
                onlineUsers: 0,
            }));
            return ok(new NodeResponseModel(result.response, cache));
        } catch (error) {
            return this.failure(error);
        }
    }

    private scanOnce(
        node: NodesEntity,
        mode: 'scheduled' | 'refresh',
    ): Promise<TResult<NodesEntity>> {
        const key = JSON.stringify([node.uuid, node.controlRevision, mode]);
        const current = this.pending.get(key);
        if (current) return current;
        if (this.pending.size >= 64) return Promise.resolve(fail(ERRORS.NODE_IP_SCAN_BUSY));
        const pending = this.scan(node, mode)
            .catch((error) => this.failure(error))
            .finally(() => this.pending.delete(key));
        this.pending.set(key, pending);
        return pending;
    }

    private async scan(
        node: NodesEntity,
        mode: 'scheduled' | 'refresh',
    ): Promise<TResult<NodesEntity>> {
        const result = await this.axios.getNodeNetworkAddresses(node, node.controlRevision);
        if (!result.isOk) {
            if (
                [
                    'NODE_HTTP_404',
                    'NODE_HTTP_405',
                    'NODE_HTTP_501',
                    'NODE_NETWORK_ADDRESSES_UNSUPPORTED',
                ].includes(result.code ?? '')
            )
                return fail(ERRORS.NODE_IP_SCAN_UNSUPPORTED);
            if (result.code === 'NODE_ROUTE_BUSY') return fail(ERRORS.NODE_IP_SCAN_BUSY);
            if (result.code === 'NODE_ROUTE_DISABLED') return fail(ERRORS.NODE_IP_SCAN_DISABLED);
            return fail(ERRORS.NODE_IP_SCAN_UNAVAILABLE);
        }
        const inventory = GetNetworkAddressesCommand.ResponseSchema.safeParse({
            response: result.response,
        });
        if (!inventory.success) return fail(ERRORS.NODE_IP_SCAN_INVALID);
        return ok(
            await this.nodes.applyIpScan({
                uuid: node.uuid,
                addresses: inventory.data.response.addresses,
                expectedControlRevision: node.controlRevision,
                expectedScanRevision: node.ipInventory?.revision ?? null,
                mode,
            }),
        );
    }

    async observe(uuid: string, controlRevision: string): Promise<TResult<NodesEntity | null>> {
        try {
            const node = await this.nodes.findByUUID(uuid);
            if (!node) return fail(ERRORS.NODE_NOT_FOUND);
            if (node.controlRevision !== controlRevision)
                return fail(ERRORS.NODE_CONTROL_REVISION_CONFLICT);
            if (node.isDisabled || !node.controlAddresses.some((row) => row.enabled))
                return fail(ERRORS.NODE_IP_SCAN_DISABLED);
            if (
                node.ipInventory &&
                Date.now() - node.ipInventory.scannedAt.getTime() < NODE_IP_SCAN_INTERVAL_MS
            )
                return ok(null);
            const key = JSON.stringify([uuid, controlRevision]);
            const now = Date.now();
            if ((this.retryAt.get(key) ?? 0) > now) return ok(null);
            const result = await this.scanOnce(node, 'scheduled');
            if (result.isOk) {
                this.retryAt.delete(key);
            } else {
                for (const [entry, until] of this.retryAt) {
                    if (until <= now || this.retryAt.size >= 256) this.retryAt.delete(entry);
                }
                this.retryAt.set(
                    key,
                    now +
                        (result.code === ERRORS.NODE_IP_SCAN_UNSUPPORTED.code
                            ? NODE_IP_SCAN_INTERVAL_MS
                            : 60_000),
                );
            }
            return result;
        } catch (error) {
            return this.failure(error);
        }
    }
}

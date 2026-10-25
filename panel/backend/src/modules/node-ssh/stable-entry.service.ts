import type { NodeUpgradeRequest } from './ssh/node-upgrade';

import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { NodePortPlansService } from '@modules/nodes/node-port-plans.service';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid/get-node-by-uuid.query';

@Injectable()
export class StableEntryService {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly queryBus: QueryBus,
        private readonly plans: NodePortPlansService,
    ) {}

    async prepare(gatewayUuid: string, input: NonNullable<NodeUpgradeRequest['entry']>) {
        const host = await this.prisma.tx.hosts.findUnique({
            where: { uuid: input.hostUuid },
            include: { nodes: true },
        });
        if (
            !host ||
            host.isDisabled ||
            !host.configProfileInboundUuid ||
            !host.configProfileUuid ||
            host.port !== input.listenPort
        )
            throw new Error('Select an enabled host with an inbound');
        const gateway = await this.queryBus.execute(new GetNodeByUuidQuery(gatewayUuid));
        if (
            !gateway.isOk ||
            gateway.response.isDisabled ||
            gateway.response.port === input.listenPort
        )
            throw new Error('Gateway is unavailable or its management port is reserved');
        const gatewayPlan = await this.plans.get(gatewayUuid);
        if (
            gatewayPlan.enabled
                ? gatewayPlan.bindings.some((b) => b.port === input.listenPort)
                : gateway.response.activeInbounds.some((b) => b.port === input.listenPort)
        )
            throw new Error('Entry port is already used by an inbound');
        const registered = new Set(host.nodes.map((n) => n.nodeUuid));
        const backends: { address: string; port: number }[] = [];
        for (const uuid of input.backendNodeUuids) {
            if (uuid === gatewayUuid || !registered.has(uuid))
                throw new Error('Backend is not assigned to this host');
            const result = await this.queryBus.execute(new GetNodeByUuidQuery(uuid));
            if (
                !result.isOk ||
                result.response.isDisabled ||
                !result.response.isConnected ||
                result.response.proxyUrl
            )
                throw new Error('Backend is unavailable or requires an API proxy');
            const node = result.response;
            const state = await this.plans.get(uuid);
            let port: number | null | undefined;
            if (state.enabled) {
                if (state.status !== 'APPLIED' || state.appliedRevision !== state.revision)
                    throw new Error('Wait for the backend port plan to be applied');
                const bindings = state.bindings.filter(
                    (b) => b.configProfileInboundUuid === host.configProfileInboundUuid,
                );
                if (bindings.length !== 1 || !bindings[0].networks.includes('tcp'))
                    throw new Error('A unique TCP binding is required');
                port = bindings[0].port;
            } else {
                const inbound = node.activeInbounds.find(
                    (b) => b.uuid === host.configProfileInboundUuid,
                );
                if (
                    !inbound ||
                    node.activeConfigProfileUuid !== host.configProfileUuid ||
                    inbound.network === 'kcp' ||
                    inbound.network === 'quic'
                )
                    throw new Error('Backends must share the host TCP inbound and profile');
                port = inbound.port;
            }
            if (!port || port === 22) throw new Error('Backend port is unavailable');
            // Resolve once for the reviewed apply; no user-supplied proxy/DNS strings
            // enter HAProxy syntax. A later backend change requires another apply.
            const address = isIP(node.address)
                ? node.address
                : await Promise.race([
                      lookup(node.address).then((value) => value.address),
                      new Promise<never>((_, reject) => {
                          const timer = setTimeout(
                              () => reject(new Error('Backend DNS timed out')),
                              5000,
                          );
                          timer.unref();
                      }),
                  ]);
            if (!isIP(address)) throw new Error('Backend DNS unavailable');
            const gatewayAddresses = new Set([
                gateway.response.address,
                ...gateway.response.ips.map((ip) => ip.ip),
            ]);
            if (gatewayAddresses.has(address))
                throw new Error('A backend cannot point back to the entry');
            backends.push({ address, port });
        }
        return { listenPort: input.listenPort, strategy: input.strategy, backends };
    }
}

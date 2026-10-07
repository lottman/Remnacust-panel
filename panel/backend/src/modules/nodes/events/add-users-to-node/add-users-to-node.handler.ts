import { Logger } from '@nestjs/common';
import { IEventHandler, QueryBus } from '@nestjs/cqrs';
import { EventsHandler } from '@nestjs/cqrs';

import { AddUsersCommand as AddUsersToNodeCommandSdk } from '@remnawave/node-contract';

import { getSsPassword, isSS2022Method } from '@common/helpers/xray-config/ss-cipher';
import { TypedConfigService } from '@common/config/app-config';
import { deviceCredentials } from '@common/utils/device-identity';
import { getVlessFlowFromDbInbound } from '@common/utils/flow/get-vless-flow';
import { GetUserDevicesQuery } from '@modules/hwid-user-devices/queries/get-user-devices.query';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { GetUsersWithResolvedInboundsQuery } from '@modules/users/queries/get-users-with-resolved-inbounds';

import { NodesQueuesService } from '@queue/_nodes';

import { NodesRepository } from '../../repositories/nodes.repository';
import { AddUsersToNodeEvent } from './add-users-to-node.event';

@EventsHandler(AddUsersToNodeEvent)
export class AddUsersToNodeHandler implements IEventHandler<AddUsersToNodeEvent> {
    public readonly logger = new Logger(AddUsersToNodeHandler.name);

    constructor(
        private readonly nodesRepository: NodesRepository,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly config: TypedConfigService,
    ) {}

    async handle(event: AddUsersToNodeEvent) {
        try {
            const nodes = await this.nodesRepository.findConnectedNodes();

            if (nodes.length === 0) {
                return;
            }

            const usersResult = await this.queryBus.execute(
                new GetUsersWithResolvedInboundsQuery(event.ids),
            );

            if (!usersResult.isOk || usersResult.response.length === 0) {
                return;
            }

            const activeNodes = nodes.filter(
                (node) => node.activeInbounds.length > 0 && node.activeConfigProfileUuid,
            );

            if (activeNodes.length === 0) return;

            for (const node of activeNodes) {
                const activeTags = new Set(node.activeInbounds.map((ib) => ib.tag));

                const usersForNode: AddUsersToNodeCommandSdk.Request['users'] = [];
                const usersToRemove: Array<{ userId: string; hashUuid: string }> = [];

                for (const user of usersResult.response) {
                    const { id, trojanPassword, vlessUuid, ssPassword, inbounds } = user;
                    const filteredInbounds = inbounds.filter((ib) => ib.profileUuid === node.activeConfigProfileUuid && node.activeInbounds.some(active => active.uuid === ib.uuid));

                    if (process.env.XERA_PERSONAL_SUBSCRIPTIONS === 'true') {
                        const devices = await this.queryBus.execute(new GetUserDevicesQuery(id));
                        const hasBlockedDevice = devices.some((device) => device.blocked);
                        if (hasBlockedDevice) {
                            usersToRemove.push({ userId: id.toString(), hashUuid: vlessUuid });
                        }
                        for (const device of devices) {
                            const identity = deviceCredentials(this.config.getOrThrow('APP_SECRET'), id, device.hwid, vlessUuid);
                            if (device.blocked || filteredInbounds.length === 0) {
                                usersToRemove.push({ userId: identity.username, hashUuid: identity.vlessUuid });
                            } else {
                                usersForNode.push({
                                    userData: {
                                        userId: identity.username,
                                        hashUuid: identity.vlessUuid,
                                        vlessUuid: identity.vlessUuid,
                                        trojanPassword: identity.trojanPassword,
                                        ssPassword: identity.ssPassword,
                                    },
                                    inboundData: filteredInbounds.map((inbound) => {
                                        const type = this.resolveInboundType(inbound);
                                        switch (type) {
                                            case 'vless': return { type, tag: inbound.tag, flow: getVlessFlowFromDbInbound(inbound) };
                                            case 'trojan': return { type, tag: inbound.tag };
                                            case 'shadowsocks': return { type, tag: inbound.tag };
                                            case 'shadowsocks22': return { type, tag: inbound.tag, password: getSsPassword(identity.ssPassword, true, (inbound.rawInbound as { settings?: { method?: string } } | null)?.settings?.method) };
                                            case 'masque': return { type, tag: inbound.tag };
                                            case 'hysteria': return { type, tag: inbound.tag };
                                            default: throw new Error(`Unsupported inbound type: ${type}`);
                                        }
                                    }),
                                });
                            }
                        }
                        // During migration, clients without HWID still need the
                        // shared credential. Revoke it only after an HWID block.
                        if (hasBlockedDevice) continue;
                    }

                    if (filteredInbounds.length === 0) {
                        usersToRemove.push({ userId: id.toString(), hashUuid: vlessUuid });
                        continue;
                    }

                    usersForNode.push({
                        userData: {
                            userId: id.toString(),
                            hashUuid: vlessUuid,
                            vlessUuid,
                            trojanPassword,
                            ssPassword,
                        },
                        inboundData: filteredInbounds.map((inbound) => {
                            const inboundType = this.resolveInboundType(inbound);

                            switch (inboundType) {
                                case 'trojan':
                                    return { type: inboundType, tag: inbound.tag };
                                case 'vless':
                                    return {
                                        type: inboundType,
                                        tag: inbound.tag,
                                        flow: getVlessFlowFromDbInbound(inbound),
                                    };
                                case 'masque':
                                case 'hysteria':
                                    return {
                                        type: inboundType,
                                        tag: inbound.tag,
                                    };
                                case 'shadowsocks':
                                    return { type: inboundType, tag: inbound.tag };
                                case 'shadowsocks22':
                                    return { type: inboundType, tag: inbound.tag, password: getSsPassword(ssPassword, true, (inbound.rawInbound as { settings?: { method?: string } } | null)?.settings?.method) };
                                default:
                                    throw new Error(`Unsupported inbound type: ${inboundType}`);
                            }
                        }),
                    });
                }

                if (usersForNode.length > 0) {
                    const affectedInboundTags = [...activeTags];

                    await this.nodesQueuesService.addUsersToNode({
                        data: {
                            affectedInboundTags,
                            users: usersForNode,
                        },
                        node: { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                    });
                }

                if (usersToRemove.length > 0) {
                    await this.nodesQueuesService.removeUsersFromNode({
                        data: {
                            users: usersToRemove.map((u) => ({
                                userId: u.userId,
                                hashUuid: u.hashUuid,
                            })),
                        },
                        node: { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                    });
                }
            }
        } catch (error) {
            this.logger.error(`Error in Event AddUsersToNodeHandler: ${error}`);
        }
    }

    private resolveInboundType(inbound: ConfigProfileInboundEntity): string {
        if (inbound.type === 'shadowsocks' && isSS2022Method(inbound.rawInbound)) {
            return 'shadowsocks22';
        }
        return inbound.type;
    }
}

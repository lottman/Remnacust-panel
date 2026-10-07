import { UserWithResolvedInboundEntity } from '@modules/users/entities';
import { Logger } from '@nestjs/common';
import { IEventHandler, QueryBus } from '@nestjs/cqrs';
import { EventsHandler } from '@nestjs/cqrs';

import { AddUserCommand as AddUserToNodeCommandSdk } from '@remnawave/node-contract';

import {
    getCipherTypeFromString,
    getSsPassword,
    isSS2022Method,
} from '@common/helpers/xray-config/ss-cipher';
import { getVlessFlowFromDbInbound } from '@common/utils/flow/get-vless-flow';
import { TypedConfigService } from '@common/config/app-config';
import { deviceCredentials } from '@common/utils/device-identity';
import { GetUserDevicesQuery } from '@modules/hwid-user-devices/queries/get-user-devices.query';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities/config-profile-inbound.entity';
import { GetUserWithResolvedInboundsQuery } from '@modules/users/queries/get-user-with-resolved-inbounds';

import { NodesQueuesService } from '@queue/_nodes';

import { NodesRepository } from '../../repositories/nodes.repository';
import { AddUserToNodeEvent } from './add-user-to-node.event';

@EventsHandler(AddUserToNodeEvent)
export class AddUserToNodeHandler implements IEventHandler<AddUserToNodeEvent> {
    public readonly logger = new Logger(AddUserToNodeHandler.name);

    constructor(
        private readonly nodesRepository: NodesRepository,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly queryBus: QueryBus,
        private readonly config: TypedConfigService,
    ) {}
    async handle(event: AddUserToNodeEvent, resolvedUser?: UserWithResolvedInboundEntity) {
        try {
            const userEntity = resolvedUser ? { isOk: true, response: resolvedUser } : await this.queryBus.execute(
                new GetUserWithResolvedInboundsQuery(event.userId),
            );

            if (!userEntity.isOk) {
                return false;
            }

            const { id, trojanPassword, vlessUuid, ssPassword, inbounds } = userEntity.response;

            if (inbounds.length === 0) {
                return false;
            }

            const nodes = await this.nodesRepository.findConnectedNodes();

            if (nodes.length === 0) {
                return false;
            }

            const userData: AddUserToNodeCommandSdk.Request = {
                hashData: {
                    vlessUuid,
                    prevVlessUuid: event.prevVlessUuid,
                },

                data: inbounds.map((inbound) => {
                    const inboundType = this.resolveInboundType(inbound);

                    switch (inboundType) {
                        case 'trojan':
                            return {
                                type: inboundType,
                                username: id.toString(),
                                password: trojanPassword,
                                tag: inbound.tag,
                            };
                        case 'vless':
                            return {
                                type: inboundType,
                                username: id.toString(),
                                uuid: vlessUuid,
                                flow: getVlessFlowFromDbInbound(inbound),
                                tag: inbound.tag,
                            };
                        case 'shadowsocks':
                            return {
                                type: inboundType,
                                username: id.toString(),
                                password: ssPassword,
                                tag: inbound.tag,
                                cipherType: getCipherTypeFromString(inbound.rawInbound),
                                ivCheck: false,
                            };
                        case 'shadowsocks22':
                            return {
                                type: inboundType,
                                username: id.toString(),
                                password: getSsPassword(ssPassword, true, (inbound.rawInbound as { settings?: { method?: string } } | null)?.settings?.method),
                                tag: inbound.tag,
                            };
                        case 'masque':
                        case 'hysteria':
                            return {
                                type: inboundType,
                                username: id.toString(),
                                password: vlessUuid,
                                tag: inbound.tag,
                            };
                        default:
                            throw new Error(`Unsupported inbound type: ${inboundType}`);
                    }
                }),
            };

            for (const node of nodes) {
                if (node.activeInbounds.length === 0 || !node.activeConfigProfileUuid) {
                    continue;
                }

                const activeTags = new Set(inbounds.filter(inbound => inbound.profileUuid === node.activeConfigProfileUuid && node.activeInbounds.some(active => active.uuid === inbound.uuid)).map(inbound => inbound.tag));

                if (process.env.XERA_PERSONAL_SUBSCRIPTIONS === 'true') {
                    const devices = await this.queryBus.execute(new GetUserDevicesQuery(id));
                    const hasBlockedDevice = devices.some((device) => device.blocked);
                    if (hasBlockedDevice) {
                        await this.nodesQueuesService.removeUserFromNode({
                            data: { username: id.toString(), hashData: { vlessUuid: event.prevVlessUuid || vlessUuid } },
                            node: { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                        });
                    }
                    for (const device of devices) {
                        const identity = deviceCredentials(this.config.getOrThrow('APP_SECRET'), id, device.hwid, vlessUuid);
                        const previousIdentity = event.prevVlessUuid
                            ? deviceCredentials(this.config.getOrThrow('APP_SECRET'), id, device.hwid, event.prevVlessUuid)
                            : null;
                        if (device.blocked || activeTags.size === 0) {
                            await this.nodesQueuesService.removeUserFromNode({
                                data: { username: identity.username, hashData: { vlessUuid: identity.vlessUuid } },
                                node: { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                            });
                            continue;
                        }
                        const personalData = userData.data.filter((item) => activeTags.has(item.tag)).map((item) => ({
                            ...item,
                            username: identity.username,
                            ...(item.type === 'vless' ? { uuid: identity.vlessUuid } : {}),
                            ...(item.type === 'trojan' ? { password: identity.trojanPassword } : {}),
                            ...(['hysteria', 'masque'].includes(item.type) ? { password: identity.vlessUuid } : {}),
                            ...(item.type === 'shadowsocks' ? { password: identity.ssPassword } : {}),
                            ...(item.type === 'shadowsocks22' ? { password: getSsPassword(identity.ssPassword, true, (inbounds.find(inbound => inbound.tag === item.tag)?.rawInbound as { settings?: { method?: string } } | null)?.settings?.method) } : {}),
                        })) as typeof userData.data;
                        await this.nodesQueuesService.addUserToNode({
                            data: { hashData: { vlessUuid: identity.vlessUuid, prevVlessUuid: previousIdentity?.vlessUuid }, data: personalData },
                            node: { address: node.address, port: node.port, proxyUrl: node.proxyUrl },
                        });
                    }
                    // Keep shared credentials during migration. A user with a
                    // blocked HWID must use only personal credentials.
                    if (hasBlockedDevice) continue;
                }

                const filteredData = {
                    ...userData,
                    data: userData.data.filter((item) => activeTags.has(item.tag)),
                };

                if (filteredData.data.length === 0) {
                    await this.nodesQueuesService.removeUserFromNode({
                        data: {
                            username: id.toString(),
                            hashData: {
                                vlessUuid: event.prevVlessUuid || vlessUuid,
                            },
                        },
                        node: {
                            address: node.address,
                            port: node.port,
                            proxyUrl: node.proxyUrl,
                        },
                    });

                    continue;
                }

                await this.nodesQueuesService.addUserToNode({
                    data: filteredData,
                    node: {
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                });
            }

            return true;
        } catch (error) {
            this.logger.error(`Error in Event AddUserToNodeHandler: ${error}`);
            return false;
        }
    }

    private resolveInboundType(inbound: ConfigProfileInboundEntity): string {
        if (inbound.type === 'shadowsocks' && isSS2022Method(inbound.rawInbound)) {
            return 'shadowsocks22';
        }
        return inbound.type;
    }
}

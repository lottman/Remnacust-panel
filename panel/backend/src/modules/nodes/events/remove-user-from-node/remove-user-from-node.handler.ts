import { Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { IEventHandler, EventsHandler } from '@nestjs/cqrs';

import { RemoveUserCommand as RemoveUserFromNodeCommandSdk } from '@remnawave/node-contract';

import { TypedConfigService } from '@common/config/app-config';
import { deviceCredentials } from '@common/utils/device-identity';

import { GetUserDevicesQuery } from '@modules/hwid-user-devices/queries/get-user-devices.query';
import { GetUserWithResolvedInboundsQuery } from '@modules/users/queries/get-user-with-resolved-inbounds';

import { NodesQueuesService } from '@queue/_nodes';

import { NodesRepository } from '../../repositories/nodes.repository';
import { AddUserToNodeEvent } from '../add-user-to-node/add-user-to-node.event';
import { AddUserToNodeHandler } from '../add-user-to-node/add-user-to-node.handler';
import { RemoveUserFromNodeEvent } from './remove-user-from-node.event';

@EventsHandler(RemoveUserFromNodeEvent)
export class RemoveUserFromNodeHandler implements IEventHandler<RemoveUserFromNodeEvent> {
    public readonly logger = new Logger(RemoveUserFromNodeHandler.name);

    constructor(
        private readonly nodesRepository: NodesRepository,
        private readonly queryBus: QueryBus,
        private readonly addUserHandler: AddUserToNodeHandler,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly config: TypedConfigService,
    ) {}
    async handle(event: RemoveUserFromNodeEvent, includeDisconnected = false): Promise<boolean> {
        try {
            const nodes = includeDisconnected
                ? (await this.nodesRepository.findAllNodes())
                      .filter(
                          (node) =>
                              !node.isDisabled &&
                              node.activeConfigProfileUuid &&
                              node.activeInbounds.length,
                      )
                      .map((node) => ({
                          uuid: node.uuid,
                          connectionOpts: {
                              uuid: node.uuid,
                              address: node.address,
                              port: node.port,
                              proxyUrl: node.proxyUrl,
                          },
                      }))
                : await this.nodesRepository.findConnectedNodesWithoutInbounds();

            if (nodes.length === 0) {
                return true;
            }

            const current = await this.queryBus.execute(
                new GetUserWithResolvedInboundsQuery(event.id),
            );
            if (
                current.isOk &&
                current.response.status !== 'ACTIVE' &&
                current.response.vlessUuid === event.vlessUuid &&
                current.response.inbounds.length > 0
            ) {
                // Node add-user replaces membership on all inbounds and closes old connections.
                // Query already restricts inactive users to eligible dedicated inbounds.
                if (
                    await this.addUserHandler.handle(
                        new AddUserToNodeEvent(event.id, event.vlessUuid),
                        current.response,
                        includeDisconnected,
                    )
                )
                    return true;
            }

            const userData: RemoveUserFromNodeCommandSdk.Request = {
                username: event.id.toString(),
                hashData: {
                    vlessUuid: event.vlessUuid,
                },
            };

            if (process.env.XERA_PERSONAL_SUBSCRIPTIONS === 'true') {
                const hwids =
                    event.deviceHwids ??
                    (await this.queryBus.execute(new GetUserDevicesQuery(event.id))).map(
                        (d) => d.hwid,
                    );
                const users = [
                    { userId: userData.username, hashUuid: userData.hashData.vlessUuid },
                    ...hwids.map((hwid) => {
                        const identity = deviceCredentials(
                            this.config.getOrThrow('APP_SECRET'),
                            event.id,
                            hwid,
                            event.vlessUuid,
                        );
                        return { userId: identity.username, hashUuid: identity.vlessUuid };
                    }),
                ];
                for (const node of nodes) {
                    await this.nodesQueuesService.removeUsersFromNode({
                        data: { users },
                        node: node.connectionOpts,
                    });
                }
            } else {
                await this.nodesQueuesService.removeUserFromNodeBulk(
                    nodes.map((node) => ({ data: userData, node: node.connectionOpts })),
                );
            }

            return true;
        } catch (error) {
            this.logger.error(`Error in Event RemoveUserFromNodeHandler: ${error}`);
            return false;
        }
    }
}

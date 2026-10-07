import { QueryBus } from '@nestjs/cqrs';
import { TypedConfigService } from '@common/config/app-config';
import { deviceCredentials } from '@common/utils/device-identity';
import { GetUserDevicesQuery } from '@modules/hwid-user-devices/queries/get-user-devices.query';
import { GetUserWithResolvedInboundsQuery } from '@modules/users/queries/get-user-with-resolved-inbounds';
import { AddUserToNodeHandler } from '../add-user-to-node/add-user-to-node.handler';
import { AddUserToNodeEvent } from '../add-user-to-node/add-user-to-node.event';
import { Logger } from '@nestjs/common';
import { IEventHandler, EventsHandler } from '@nestjs/cqrs';

import { RemoveUsersCommand as RemoveUsersFromNodeCommandSdk } from '@remnawave/node-contract';

import { NodesQueuesService } from '@queue/_nodes';

import { NodesRepository } from '../../repositories/nodes.repository';
import { RemoveUsersFromNodeEvent } from './remove-users-from-node.event';

@EventsHandler(RemoveUsersFromNodeEvent)
export class RemoveUsersFromNodeHandler implements IEventHandler<RemoveUsersFromNodeEvent> {
    public readonly logger = new Logger(RemoveUsersFromNodeHandler.name);

    constructor(
        private readonly nodesRepository: NodesRepository,
        private readonly queryBus: QueryBus,
        private readonly addUserHandler: AddUserToNodeHandler,
        private readonly nodesQueuesService: NodesQueuesService,
        private readonly config: TypedConfigService,
    ) {}
    async handle(event: RemoveUsersFromNodeEvent) {
        try {
            const nodes = await this.nodesRepository.findConnectedNodesWithoutInbounds();

            if (nodes.length === 0 || event.users.length === 0) {
                return;
            }

            const revoked = [];
            for (const user of event.users) {
                const current = await this.queryBus.execute(new GetUserWithResolvedInboundsQuery(user.id));
                if (current.isOk && current.response.status !== 'ACTIVE'
                    && current.response.vlessUuid === user.vlessUuid && current.response.inbounds.length > 0) {
                    if (!await this.addUserHandler.handle(new AddUserToNodeEvent(user.id, user.vlessUuid), current.response)) revoked.push(user);
                } else { revoked.push(user); }
            }
            if (revoked.length === 0) return;

            const userData: RemoveUsersFromNodeCommandSdk.Request = {
                users: (await Promise.all(revoked.map(async (user) => {
                    const entries = [{ userId: user.id.toString(), hashUuid: user.vlessUuid }];
                    if (process.env.XERA_PERSONAL_SUBSCRIPTIONS === 'true') {
                        const hwids = user.deviceHwids ?? (await this.queryBus.execute(new GetUserDevicesQuery(user.id))).map((d) => d.hwid);
                        entries.push(...hwids.map((hwid) => {
                            const identity = deviceCredentials(this.config.getOrThrow('APP_SECRET'), user.id, hwid, user.vlessUuid);
                            return { userId: identity.username, hashUuid: identity.vlessUuid };
                        }));
                    }
                    return entries;
                }))).flat(),
            };

            for (const node of nodes) {
                await this.nodesQueuesService.removeUsersFromNode({
                    data: userData,
                    node: node.connectionOpts,
                });
            }

            return;
        } catch (error) {
            this.logger.error(`Error in Event RemoveUsersFromNodeHandler: ${error}`);
        }
    }
}

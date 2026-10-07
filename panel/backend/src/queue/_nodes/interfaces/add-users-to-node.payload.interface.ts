import { AddUsersCommand as AddUsersToNodeCommandSdk } from '@remnawave/node-contract';

import { INodeConnectionOpts } from '@common/axios';

export interface IAddUsersToNodePayload {
    data: AddUsersToNodeCommandSdk.Request;
    node: INodeConnectionOpts;
}

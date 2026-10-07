import { BlockIpsCommand, UnblockIpsCommand } from '@remnawave/node-contract';

import { INodeConnectionOpts } from '@common/axios';

export interface IBlockIpsPayload {
    data: BlockIpsCommand.Request;
    node: INodeConnectionOpts;
}

export interface IUnblockIpsPayload {
    data: UnblockIpsCommand.Request;
    node: INodeConnectionOpts;
}

export interface IRecreateTablesPayload {
    node: INodeConnectionOpts;
}

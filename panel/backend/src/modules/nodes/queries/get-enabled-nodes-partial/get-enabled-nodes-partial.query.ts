import { Query } from '@nestjs/cqrs';

import { INodeConnectionOpts } from '@common/axios';
import { TResult } from '@common/types';

export interface IGetEnabledNodesPartialResponse {
    uuid: string;
    isConnected: boolean;
    lastStatusMessage: string | null;
    controlRevision: string;
    ipScanAt?: number | null;
    connectionOpts: INodeConnectionOpts;
}

export class GetEnabledNodesPartialQuery extends Query<TResult<IGetEnabledNodesPartialResponse[]>> {
    constructor() {
        super();
    }
}

import { Query } from '@nestjs/cqrs';

import { INodeConnectionOpts } from '@common/axios';
import { TResult } from '@common/types';

export interface IGetOnlineNodesPartialResponse {
    uuid: string;
    consumptionMultiplier: bigint;
    nodeConsumptionMultiplier: bigint;
    id: bigint;
    connectionOpts: INodeConnectionOpts;
}

export class GetOnlineNodesQuery extends Query<TResult<IGetOnlineNodesPartialResponse[]>> {
    constructor() {
        super();
    }
}

import { INodeConnectionOpts } from '@common/axios';

export interface IRecordUserUsagePayload {
    nodeId: string;
    nodeUuid: string;
    consumptionMultiplier: string;
    connectionOpts: INodeConnectionOpts;
}

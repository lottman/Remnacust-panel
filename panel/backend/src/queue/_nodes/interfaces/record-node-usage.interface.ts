import { INodeConnectionOpts } from '@common/axios';

export interface IRecordNodeUsagePayload {
    nodeUuid: string;
    nodeConsumptionMultiplier: string;
    connectionOpts: INodeConnectionOpts;
}

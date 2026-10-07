import { INodeConnectionOpts } from '@common/axios';

export interface INodeHealthCheckPayload {
    nodeUuid: string;
    isConnected: boolean;
    connectionOpts: INodeConnectionOpts;
}

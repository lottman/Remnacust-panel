import { INodeConnectionOpts } from '@common/axios';

export interface INodeHealthCheckPayload {
    nodeUuid: string;
    isConnected: boolean;
    lastStatusMessage?: string | null;
    controlRevision?: string;
    connectionOpts: INodeConnectionOpts;
}

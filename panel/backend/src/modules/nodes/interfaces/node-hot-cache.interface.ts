import { INodeSystem } from './node-host-info.interface';

export interface INodeVersions {
    xray: string;
    node: string;
}

export interface INodeHotCache {
    controlRevision?: string | null;
    system: INodeSystem | null;
    versions: INodeVersions | null;
    xrayUptime: number;
    onlineUsers: number;
}

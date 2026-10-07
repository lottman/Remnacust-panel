export interface INodeUsage {
    uuid: string;
    users: {
        id: number;
        totalBytes: number;
    }[];
}

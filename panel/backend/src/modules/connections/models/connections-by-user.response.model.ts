import {
    IGetIpsListNodeResult,
    IGetIpsListProgress,
    IGetIpsListResult,
} from '@queue/_nodes/interfaces';

export class ConnectionsByUserResponseModel {
    public readonly jobId: string;

    constructor(data: { jobId: string }) {
        this.jobId = data.jobId;
    }
}

export class ConnectionsByUserResultResponseModel {
    public readonly isCompleted: boolean;
    public readonly isFailed: boolean;
    public readonly progress: IGetIpsListProgress;
    public readonly result: {
        success: boolean;
        userId: number;
        nodes: IGetIpsListNodeResult[];
        failedNodes?: { nodeUuid: string; nodeName: string }[];
    } | null;

    constructor(data: IGetIpsListResult) {
        this.isCompleted = data.isCompleted;
        this.isFailed = data.isFailed;
        this.progress = data.progress;
        this.result = data.result;
    }
}

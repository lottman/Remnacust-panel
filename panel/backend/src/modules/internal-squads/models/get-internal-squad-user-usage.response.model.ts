export class GetInternalSquadUserUsageResponseModel {
    public readonly days: {
        date: string;
        nodes: { uuid: string; totalBytes: number }[];
    }[];

    constructor(data: GetInternalSquadUserUsageResponseModel) {
        this.days = data.days;
    }
}

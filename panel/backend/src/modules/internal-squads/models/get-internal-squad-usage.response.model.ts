export class GetInternalSquadUsageResponseModel {
    public readonly squadUuid: string;
    public readonly users: {
        id: number;
        totalBytes: number;
    }[];
    public readonly nextCursor: string | null;
    public readonly hasMore: boolean;

    constructor(data: GetInternalSquadUsageResponseModel) {
        this.squadUuid = data.squadUuid;
        this.users = data.users;
        this.nextCursor = data.nextCursor;
        this.hasMore = data.hasMore;
    }
}

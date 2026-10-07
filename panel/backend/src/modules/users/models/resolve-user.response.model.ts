export class ResolveUserResponseModel {
    public readonly id: number;
    public readonly shortUuid: string;
    public readonly username: string;

    constructor(data: ResolveUserResponseModel) {
        this.id = data.id;
        this.shortUuid = data.shortUuid;
        this.username = data.username;
    }
}

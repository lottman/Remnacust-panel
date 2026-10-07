import { GetFullUserResponseModel } from './get-full-user.response.model';

export class GetUsersStreamResponseModel {
    public readonly users: GetFullUserResponseModel[];
    public readonly nextCursor: string | null;
    public readonly hasMore: boolean;

    constructor(data: GetUsersStreamResponseModel) {
        this.users = data.users;
        this.nextCursor = data.nextCursor;
        this.hasMore = data.hasMore;
    }
}

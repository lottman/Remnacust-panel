import { ApiTokenEntity } from '../entities/api-token.entity';

export class CreateApiTokenResponseModel {
    public readonly uuid: string;
    public readonly name: string;
    public readonly expireAt: Date;
    public readonly scopes: string[];
    public readonly createdAt: Date;
    public readonly updatedAt: Date;

    public readonly token: string;

    constructor(data: ApiTokenEntity, token: string) {
        this.name = data.name;
        this.expireAt = data.expireAt;
        this.uuid = data.uuid;
        this.scopes = data.scopes;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
        this.token = token;
    }
}

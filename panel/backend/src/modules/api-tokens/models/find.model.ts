import { ApiTokenEntity } from '../entities/api-token.entity';

export class FindAllApiTokensResponseModel {
    public tokens: {
        uuid: string;
        name: string;
        expireAt: Date;
        scopes: string[];

        createdAt: Date;
        updatedAt: Date;
    }[];

    constructor(data: ApiTokenEntity) {
        this.tokens = [
            {
                uuid: data.uuid,
                name: data.name,
                expireAt: data.expireAt,
                scopes: data.scopes,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
            },
        ];
    }
}

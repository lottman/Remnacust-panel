import { ApiTokens } from '@prisma/client';

export class ApiTokenEntity implements ApiTokens {
    public uuid: string;
    public name: string;
    public expireAt: Date;
    public scopes: string[];

    public createdAt: Date;
    public updatedAt: Date;

    constructor(apiToken: Partial<ApiTokens>) {
        Object.assign(this, apiToken);
        return this;
    }
}

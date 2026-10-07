import { ApiTokens } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { UniversalConverter } from '@common/converter/universalConverter';

import { ApiTokenEntity } from './entities/api-token.entity';

const modelToEntity = (model: ApiTokens): ApiTokenEntity => {
    return new ApiTokenEntity(model);
};

const entityToModel = (entity: ApiTokenEntity): ApiTokens => {
    return {
        uuid: entity.uuid,
        name: entity.name,
        expireAt: entity.expireAt,
        scopes: entity.scopes,

        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
};
@Injectable()
export class ApiTokenConverter extends UniversalConverter<ApiTokenEntity, ApiTokens> {
    constructor() {
        super(modelToEntity, entityToModel);
    }
}

import { InfraBillingNodes } from '@prisma/client';

import { Injectable } from '@nestjs/common';

import { UniversalConverter } from '@common/converter/universalConverter';

import { InfraBillingNodeEntity } from '../entities';

const modelToEntity = (model: InfraBillingNodes): InfraBillingNodeEntity => {
    return new InfraBillingNodeEntity(model);
};

const entityToModel = (entity: InfraBillingNodeEntity): InfraBillingNodes => {
    return {
        uuid: entity.uuid,
        nodeUuid: entity.nodeUuid,
        providerUuid: entity.providerUuid,
        name: entity.name,
        nextBillingAt: entity.nextBillingAt,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
};

@Injectable()
export class InfraBillingNodeConverter extends UniversalConverter<
    InfraBillingNodeEntity,
    InfraBillingNodes
> {
    constructor() {
        super(modelToEntity, entityToModel);
    }
}

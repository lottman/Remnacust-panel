import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import { Injectable } from '@nestjs/common';

import { ICrud } from '@common/types/crud-port';

import { ApiTokenConverter } from '../api-tokens.converter';
import { ApiTokenEntity } from '../entities/api-token.entity';

@Injectable()
export class ApiTokensRepository implements ICrud<ApiTokenEntity> {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly apiTokenConverter: ApiTokenConverter,
    ) {}

    public async create(entity: ApiTokenEntity): Promise<ApiTokenEntity> {
        const model = this.apiTokenConverter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.apiTokens.create({
            data: model,
        });

        return this.apiTokenConverter.fromPrismaModelToEntity(result);
    }

    public async findByUUID(uuid: string): Promise<ApiTokenEntity | null> {
        const result = await this.prisma.tx.apiTokens.findUnique({
            where: { uuid },
        });
        if (!result) {
            return null;
        }
        return this.apiTokenConverter.fromPrismaModelToEntity(result);
    }

    public async update({ uuid, ...data }: Partial<ApiTokenEntity>): Promise<ApiTokenEntity> {
        const result = await this.prisma.tx.apiTokens.update({
            where: {
                uuid,
            },
            data,
        });

        return this.apiTokenConverter.fromPrismaModelToEntity(result);
    }

    public async findByCriteria(
        dto: Partial<Omit<ApiTokenEntity, 'scopes'>>,
    ): Promise<ApiTokenEntity[]> {
        const bannerList = await this.prisma.tx.apiTokens.findMany({
            where: dto,
            orderBy: {
                createdAt: 'asc',
            },
        });
        return this.apiTokenConverter.fromPrismaModelsToEntities(bannerList);
    }

    public async findFirstByCriteria(
        dto: Partial<Omit<ApiTokenEntity, 'scopes'>>,
    ): Promise<ApiTokenEntity | null> {
        const result = await this.prisma.tx.apiTokens.findFirst({
            where: dto,
        });

        if (!result) {
            return null;
        }

        return this.apiTokenConverter.fromPrismaModelToEntity(result);
    }

    public async deleteByUUID(uuid: string): Promise<boolean> {
        const result = await this.prisma.tx.apiTokens.delete({ where: { uuid } });
        return !!result;
    }
}

import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { RawCacheService } from '@common/raw-cache';
import { fail, ok, TResult } from '@common/types';
import { ERRORS, EVENTS } from '@libs/contracts/constants';

import { ServiceEvent } from '@integration-modules/notifications/interfaces';

import { SignOttTokenCommand } from '@modules/auth/commands/sign-ott-token/sign-ott-token.command';
import type { IJWTAuthPayload } from '@modules/auth/interfaces';

import { SignApiTokenCommand } from '../auth/commands/sign-api-token/sign-api-token.command';
import { CreateApiTokenBodyDto, UpdateApiTokenBodyDto } from './dtos';
import { ApiTokenEntity } from './entities/api-token.entity';
import { IGroupedScopeCatalog } from './interfaces';
import { CreateApiTokenResponseModel, GetOttResponseModel } from './models';
import { FindAllApiTokensResponseModel } from './models/find.model';
import { ApiTokensRepository } from './repositories/api-tokens.repository';
import { ScopeCatalogService } from './scope-catalog.service';

@Injectable()
export class ApiTokensService {
    private readonly logger = new Logger(ApiTokensService.name);
    constructor(
        private readonly rawCacheService: RawCacheService,
        private readonly apiTokensRepository: ApiTokensRepository,
        private readonly commandBus: CommandBus,
        private readonly configService: TypedConfigService,
        private readonly scopeCatalogService: ScopeCatalogService,
        private readonly eventEmitter: EventEmitter2,
    ) {}

    public async create(
        body: CreateApiTokenBodyDto,
    ): Promise<TResult<CreateApiTokenResponseModel>> {
        const { name, expiresInDays, scopes } = body;

        try {
            const invalidScopes = this.scopeCatalogService.findInvalidScopes(scopes);
            if (invalidScopes.length > 0) {
                this.logger.warn(
                    `Rejected API token with invalid scopes: ${invalidScopes.join(', ')}`,
                );
                return fail(ERRORS.INVALID_API_TOKEN_SCOPE);
            }

            const uuid = randomUUID();
            const expireAt = dayjs().utc().add(expiresInDays, 'days').toDate();

            const token = await this.commandBus.execute(
                new SignApiTokenCommand(uuid, expiresInDays),
            );

            if (!token.isOk) {
                return fail(ERRORS.CREATE_API_TOKEN_ERROR);
            }

            const apiTokenEntity = new ApiTokenEntity({
                uuid,
                name,
                expireAt,
                scopes,
            });

            const newApiTokenEntity = await this.apiTokensRepository.create(apiTokenEntity);

            this.eventEmitter.emit(
                EVENTS.SERVICE.API_TOKEN_CREATED,
                new ServiceEvent(EVENTS.SERVICE.API_TOKEN_CREATED, {
                    apiToken: {
                        name,
                        uuid,
                        expireAt,
                        scopes,
                    },
                }),
            );

            return ok(new CreateApiTokenResponseModel(newApiTokenEntity, token.response));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_API_TOKEN_ERROR);
        }
    }

    public async update(uuid: string, body: UpdateApiTokenBodyDto): Promise<TResult<ApiTokenEntity>> {
        try {
            const scopes = [...new Set(body.scopes)];
            if (this.scopeCatalogService.findInvalidScopes(scopes).length > 0) {
                return fail(ERRORS.INVALID_API_TOKEN_SCOPE);
            }
            const token = await this.apiTokensRepository.update({ uuid, name: body.name, scopes });
            // JwtDefaultGuard reads the database on every request. Do not issue
            // a replacement JWT or accidentally extend its expiry while editing.
            try {
                await this.rawCacheService.del(`api:${uuid}`);
            } catch {
                this.logger.warn('Token permissions saved; legacy token cache invalidation failed');
            }
            return ok(token);
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return fail(ERRORS.REQUESTED_TOKEN_NOT_FOUND);
            }
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async delete(uuid: string): Promise<TResult<boolean>> {
        try {
            const apiToken = await this.apiTokensRepository.findByUUID(uuid);

            if (!apiToken) {
                return fail(ERRORS.REQUESTED_TOKEN_NOT_FOUND);
            }

            await this.apiTokensRepository.deleteByUUID(uuid);

            await this.rawCacheService.del(`api:${uuid}`);

            this.eventEmitter.emit(
                EVENTS.SERVICE.API_TOKEN_DELETED,
                new ServiceEvent(EVENTS.SERVICE.API_TOKEN_DELETED, {
                    apiToken: {
                        name: apiToken.name,
                        uuid: apiToken.uuid,
                        expireAt: apiToken.expireAt,
                        scopes: apiToken.scopes,
                    },
                }),
            );
            return ok(true);
        } catch (error) {
            this.logger.error(JSON.stringify(error));

            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2025') {
                    return fail(ERRORS.REQUESTED_TOKEN_NOT_FOUND);
                }
            }
            return fail(ERRORS.DELETE_API_TOKEN_ERROR);
        }
    }

    public async get(): Promise<TResult<FindAllApiTokensResponseModel>> {
        try {
            const result = await this.apiTokensRepository.findByCriteria({});

            return ok({
                tokens: result.map((item) => item),
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.FIND_ALL_API_TOKENS_ERROR);
        }
    }

    public getAvailableScopes(): TResult<IGroupedScopeCatalog> {
        return ok(this.scopeCatalogService.getGroupedCatalog());
    }

    public async getOtt(payload: IJWTAuthPayload): Promise<TResult<GetOttResponseModel>> {
        try {
            const ott = await this.commandBus.execute(new SignOttTokenCommand(payload));

            if (!ott.isOk) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            return ok(new GetOttResponseModel(ott.response));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

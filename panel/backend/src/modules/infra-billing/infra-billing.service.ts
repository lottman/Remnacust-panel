import { Injectable, Logger } from '@nestjs/common';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import {
    CreateInfraBillingNodeBodyDto,
    CreateInfraBillingRecordBodyDto,
    CreateInfraProviderBodyDto,
    GetInfraBillingRecordsQueryDto,
    UpdateInfraBillingNodeBodyDto,
    UpdateInfraProviderBodyDto,
} from './dtos';
import { InfraBillingHistoryEntity, InfraBillingNodeEntity, InfraProviderEntity } from './entities';
import {
    GetBillingNodesResponseModel,
    GetInfraBillingHistoryRecordsResponseModel,
    GetInfraProvidersResponseModel,
} from './models';
import { GetInfraProviderByUuidResponseModel } from './models/get-infra-provider-by-uuid.response.model';
import {
    InfraBillingHistoryRepository,
    InfraBillingNodeRepository,
    InfraProviderRepository,
} from './repositories';

@Injectable()
export class InfraBillingService {
    private readonly logger = new Logger(InfraBillingService.name);

    constructor(
        private readonly infraBillingHistoryRepository: InfraBillingHistoryRepository,
        private readonly infraBillingNodeRepository: InfraBillingNodeRepository,
        private readonly infraProviderRepository: InfraProviderRepository,
    ) {}

    public async getInfraProviders(): Promise<TResult<GetInfraProvidersResponseModel>> {
        try {
            const providers = await this.infraProviderRepository.getFullInfraProviders();

            return ok(new GetInfraProvidersResponseModel(providers, providers.length));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_INFRA_PROVIDERS_ERROR);
        }
    }

    public async getInfraProviderByUuid(
        uuid: string,
    ): Promise<TResult<GetInfraProviderByUuidResponseModel>> {
        try {
            const provider = await this.infraProviderRepository.getFullInfraProvidersByUuid(uuid);

            if (!provider) {
                return fail(ERRORS.INFRA_PROVIDER_NOT_FOUND);
            }

            return ok(new GetInfraProviderByUuidResponseModel(provider));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_INFRA_PROVIDER_BY_UUID_ERROR);
        }
    }

    public async deleteInfraProviderByUuid(uuid: string): Promise<TResult<boolean>> {
        try {
            await this.infraProviderRepository.deleteByUUID(uuid);

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_INFRA_PROVIDER_BY_UUID_ERROR);
        }
    }

    public async createInfraProvider(
        dto: CreateInfraProviderBodyDto,
    ): Promise<TResult<GetInfraProviderByUuidResponseModel>> {
        try {
            const provider = await this.infraProviderRepository.create(
                new InfraProviderEntity(dto),
            );

            return await this.getInfraProviderByUuid(provider.uuid);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_INFRA_PROVIDER_ERROR);
        }
    }

    public async updateInfraProvider(
        dto: UpdateInfraProviderBodyDto,
    ): Promise<TResult<GetInfraProviderByUuidResponseModel>> {
        try {
            const provider = await this.infraProviderRepository.update(
                new InfraProviderEntity(dto),
            );

            return await this.getInfraProviderByUuid(provider.uuid);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_INFRA_PROVIDER_ERROR);
        }
    }

    public async getInfraBillingHistoryRecords(
        dto: GetInfraBillingRecordsQueryDto,
    ): Promise<TResult<GetInfraBillingHistoryRecordsResponseModel>> {
        try {
            const records = await this.infraBillingHistoryRepository.getInfraBillingHistoryRecords(
                dto.start,
                dto.size,
            );

            const count =
                await this.infraBillingHistoryRepository.getInfraBillingHistoryRecordsCount();

            return ok(new GetInfraBillingHistoryRecordsResponseModel(records, count));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_INFRA_BILLING_HISTORY_RECORDS_ERROR);
        }
    }

    public async createInfraBillingHistoryRecord(
        dto: CreateInfraBillingRecordBodyDto,
    ): Promise<TResult<GetInfraBillingHistoryRecordsResponseModel>> {
        try {
            await this.infraBillingHistoryRepository.create(new InfraBillingHistoryEntity(dto));

            return await this.getInfraBillingHistoryRecords({
                start: 0,
                size: 50,
            });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_INFRA_BILLING_HISTORY_RECORD_ERROR);
        }
    }

    public async deleteInfraBillingHistoryRecordByUuid(uuid: string): Promise<TResult<boolean>> {
        try {
            await this.infraBillingHistoryRepository.deleteByUUID(uuid);

            return ok(true);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_INFRA_BILLING_HISTORY_RECORD_BY_UUID_ERROR);
        }
    }

    public async getBillingNodes(): Promise<TResult<GetBillingNodesResponseModel>> {
        try {
            const nodes = await this.infraBillingNodeRepository.getBillingNodes();

            const availableNodes = await this.infraBillingNodeRepository.getAvailableBillingNodes();

            const summary = await this.infraBillingNodeRepository.getInfraSummary();

            return ok(
                new GetBillingNodesResponseModel(
                    nodes,
                    availableNodes,
                    nodes.length,
                    availableNodes.length,
                    summary,
                ),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_BILLING_NODES_ERROR);
        }
    }

    public async updateInfraBillingNode(
        dto: UpdateInfraBillingNodeBodyDto,
    ): Promise<TResult<GetBillingNodesResponseModel>> {
        try {
            await this.infraBillingNodeRepository.updateManyBillingAt({
                uuids: dto.uuids,
                nextBillingAt: dto.nextBillingAt,
            });

            return await this.getBillingNodes();
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_INFRA_BILLING_NODE_ERROR);
        }
    }

    public async createInfraBillingNode(
        dto: CreateInfraBillingNodeBodyDto,
    ): Promise<TResult<GetBillingNodesResponseModel>> {
        try {
            if (!dto.nodeUuid && !dto.name) {
                return fail(ERRORS.CREATE_INFRA_BILLING_NODE_MISSING_TARGET);
            }

            await this.infraBillingNodeRepository.create(new InfraBillingNodeEntity(dto));

            return await this.getBillingNodes();
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_INFRA_BILLING_NODE_ERROR);
        }
    }

    public async deleteInfraBillingNodeByUuid(
        uuid: string,
    ): Promise<TResult<GetBillingNodesResponseModel>> {
        try {
            await this.infraBillingNodeRepository.deleteByUUID(uuid);

            return await this.getBillingNodes();
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.DELETE_INFRA_BILLING_NODE_BY_UUID_ERROR);
        }
    }
}

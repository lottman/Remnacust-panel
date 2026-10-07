import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants/errors';

import { GetNodeIdByUuidQuery } from '@modules/nodes/queries/get-node-id-by-uuid';

import { NodeMetadataEntity, UserMetadataEntity } from './entities';
import { BaseMetadataResponseModel } from './models/base-metadata.response.model';
import { NodeMetadataRepository } from './repositories/node-metadata.repository';
import { UserMetadataRepository } from './repositories/user-metadata.repository';

@Injectable()
export class MetadataService {
    private readonly logger = new Logger(MetadataService.name);

    constructor(
        private readonly userMetadataRepository: UserMetadataRepository,
        private readonly nodeMetadataRepository: NodeMetadataRepository,
        private readonly queryBus: QueryBus,
    ) {}

    public async getUserMetadata(userId: number): Promise<TResult<BaseMetadataResponseModel>> {
        try {
            const userMetadata = await this.userMetadataRepository.getByUserId(BigInt(userId));

            if (userMetadata === null) {
                return fail(ERRORS.METADATA_NOT_FOUND);
            }

            return ok(new BaseMetadataResponseModel(userMetadata));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async upsertUserMetadata(
        userId: number,
        metadata: unknown,
    ): Promise<TResult<BaseMetadataResponseModel>> {
        try {
            const userMetadata = await this.userMetadataRepository.upsert(
                new UserMetadataEntity({ userId: BigInt(userId), metadata }),
            );

            return ok(new BaseMetadataResponseModel(userMetadata));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async getNodeMetadata(nodeUuid: string): Promise<TResult<BaseMetadataResponseModel>> {
        try {
            const nodeId = await this.queryBus.execute(new GetNodeIdByUuidQuery(nodeUuid));

            if (!nodeId.isOk) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            if (nodeId.response === null) {
                return fail(ERRORS.NODE_NOT_FOUND);
            }

            const nodeMetadata = await this.nodeMetadataRepository.getByNodeId(nodeId.response);

            if (nodeMetadata === null) {
                return fail(ERRORS.METADATA_NOT_FOUND);
            }

            return ok(new BaseMetadataResponseModel(nodeMetadata));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async upsertNodeMetadata(
        nodeUuid: string,
        metadata: unknown,
    ): Promise<TResult<BaseMetadataResponseModel>> {
        try {
            const nodeId = await this.queryBus.execute(new GetNodeIdByUuidQuery(nodeUuid));

            if (!nodeId.isOk) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            if (nodeId.response === null) {
                return fail(ERRORS.NODE_NOT_FOUND);
            }

            const nodeMetadata = await this.nodeMetadataRepository.upsert(
                new NodeMetadataEntity({ nodeId: nodeId.response, metadata }),
            );

            return ok(new BaseMetadataResponseModel(nodeMetadata));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { NodesEntity } from '../../entities/nodes.entity';
import { NodesRepository } from '../../repositories/nodes.repository';
import { GetAllNodesQuery } from './get-all-nodes.query';

@QueryHandler(GetAllNodesQuery)
export class GetAllNodesHandler implements IQueryHandler<GetAllNodesQuery, TResult<NodesEntity[]>> {
    private readonly logger = new Logger(GetAllNodesHandler.name);
    constructor(private readonly nodesRepository: NodesRepository) {}

    async execute(): Promise<TResult<NodesEntity[]>> {
        try {
            const nodes = await this.nodesRepository.findAllNodes();

            return ok(nodes);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

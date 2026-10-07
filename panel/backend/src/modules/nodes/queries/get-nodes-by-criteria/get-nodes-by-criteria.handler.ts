import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { NodesEntity } from '../../entities/nodes.entity';
import { NodesRepository } from '../../repositories/nodes.repository';
import { GetNodesByCriteriaQuery } from './get-nodes-by-criteria.query';

@QueryHandler(GetNodesByCriteriaQuery)
export class GetNodesByCriteriaHandler implements IQueryHandler<
    GetNodesByCriteriaQuery,
    TResult<NodesEntity[]>
> {
    private readonly logger = new Logger(GetNodesByCriteriaHandler.name);
    constructor(private readonly nodesRepository: NodesRepository) {}

    async execute(query: GetNodesByCriteriaQuery): Promise<TResult<NodesEntity[]>> {
        try {
            const nodes = await this.nodesRepository.findByCriteria(query.criteria);

            return ok(nodes);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { NodesEntity } from '../../entities/nodes.entity';
import { NodesRepository } from '../../repositories/nodes.repository';
import { FindNodesByCriteriaQuery } from './find-nodes-by-criteria.query';

@QueryHandler(FindNodesByCriteriaQuery)
export class FindNodesByCriteriaHandler implements IQueryHandler<
    FindNodesByCriteriaQuery,
    TResult<NodesEntity[]>
> {
    private readonly logger = new Logger(FindNodesByCriteriaHandler.name);
    constructor(private readonly nodesRepository: NodesRepository) {}

    async execute(query: FindNodesByCriteriaQuery): Promise<TResult<NodesEntity[]>> {
        try {
            const nodes = await this.nodesRepository.findByCriteriaPrisma(query.where);

            return ok(nodes);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

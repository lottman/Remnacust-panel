import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { NodesUserUsageHistoryRepository } from '../../repositories/nodes-user-usage-history.repository';
import { GetNewUsersTrafficQuery } from './get-new-users-traffic.query';

@QueryHandler(GetNewUsersTrafficQuery)
export class GetNewUsersTrafficHandler implements IQueryHandler<
    GetNewUsersTrafficQuery,
    TResult<bigint>
> {
    private readonly logger = new Logger(GetNewUsersTrafficHandler.name);
    constructor(
        private readonly nodesUserUsageHistoryRepository: NodesUserUsageHistoryRepository,
    ) {}

    async execute(query: GetNewUsersTrafficQuery): Promise<TResult<bigint>> {
        try {
            const totalBytes = await this.nodesUserUsageHistoryRepository.getNewUsersTrafficByRange(
                query.start,
                query.endExclusive,
            );

            return ok(totalBytes);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { UsersRepository } from '../../repositories/users.repository';
import { GetUsersDigestQuery } from './get-users-digest.query';

@QueryHandler(GetUsersDigestQuery)
export class GetUsersDigestHandler implements IQueryHandler<
    GetUsersDigestQuery,
    TResult<{ createdCount: number; expiredCount: number }>
> {
    private readonly logger = new Logger(GetUsersDigestHandler.name);
    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(
        query: GetUsersDigestQuery,
    ): Promise<TResult<{ createdCount: number; expiredCount: number }>> {
        try {
            const digest = await this.usersRepository.getUsersDigestByRange(
                query.start,
                query.endExclusive,
            );

            return ok(digest);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

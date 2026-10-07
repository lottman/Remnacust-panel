import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { UserEntity } from '@modules/users/entities/user.entity';

import { UsersRepository } from '../../repositories/users.repository';
import { GetUsersWithPaginationQuery } from './get-users-with-pagination.query';

@QueryHandler(GetUsersWithPaginationQuery)
export class GetUsersWithPaginationHandler implements IQueryHandler<
    GetUsersWithPaginationQuery,
    TResult<{ users: UserEntity[]; total: number }>
> {
    private readonly logger = new Logger(GetUsersWithPaginationHandler.name);
    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(
        query: GetUsersWithPaginationQuery,
    ): Promise<TResult<{ users: UserEntity[]; total: number }>> {
        try {
            const [users, total] = await this.usersRepository.getUsersWithPagination(query);

            return ok({ users, total });
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

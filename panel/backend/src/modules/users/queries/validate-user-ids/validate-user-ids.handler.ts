import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { UsersRepository } from '../../repositories/users.repository';
import { ValidateUserIdsQuery } from './validate-user-ids.query';

@QueryHandler(ValidateUserIdsQuery)
export class ValidateUserIdsHandler implements IQueryHandler<
    ValidateUserIdsQuery,
    TResult<bigint[]>
> {
    private readonly logger = new Logger(ValidateUserIdsHandler.name);
    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(query: ValidateUserIdsQuery): Promise<TResult<bigint[]>> {
        try {
            const userIds = await this.usersRepository.validateUserIds(query.userIds);

            return ok(userIds);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

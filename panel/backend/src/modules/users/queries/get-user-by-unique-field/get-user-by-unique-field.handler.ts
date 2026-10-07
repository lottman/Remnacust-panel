import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { UserEntity } from '@modules/users/entities';

import { UsersRepository } from '../../repositories/users.repository';
import { GetUserByUniqueFieldQuery } from './get-user-by-unique-field.query';

@QueryHandler(GetUserByUniqueFieldQuery)
export class GetUserByUniqueFieldHandler implements IQueryHandler<
    GetUserByUniqueFieldQuery,
    TResult<UserEntity>
> {
    private readonly logger = new Logger(GetUserByUniqueFieldHandler.name);
    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(query: GetUserByUniqueFieldQuery): Promise<TResult<UserEntity>> {
        try {
            const user = await this.usersRepository.findUniqueByCriteria(
                {
                    username: query.field.username,
                    shortUuid: query.field.shortUuid,
                    id: query.field.id,
                },
                query.includeOptions,
            );

            if (!user) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            return ok(user);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

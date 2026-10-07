import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { UserWithResolvedInboundEntity } from '@modules/users/entities';

import { UsersRepository } from '../../repositories/users.repository';
import { GetUserWithResolvedInboundsQuery } from './get-user-with-resolved-inbounds.query';

@QueryHandler(GetUserWithResolvedInboundsQuery)
export class GetUserWithResolvedInboundsHandler implements IQueryHandler<
    GetUserWithResolvedInboundsQuery,
    TResult<UserWithResolvedInboundEntity>
> {
    private readonly logger = new Logger(GetUserWithResolvedInboundsHandler.name);
    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(
        query: GetUserWithResolvedInboundsQuery,
    ): Promise<TResult<UserWithResolvedInboundEntity>> {
        try {
            const user = await this.usersRepository.getUserWithResolvedInbounds(query.userId);

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

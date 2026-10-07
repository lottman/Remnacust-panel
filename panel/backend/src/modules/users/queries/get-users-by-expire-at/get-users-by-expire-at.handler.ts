import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { UsersRepository } from '../../repositories/users.repository';
import { GetUsersByExpireAtQuery } from './get-users-by-expire-at.query';

@QueryHandler(GetUsersByExpireAtQuery)
export class GetUsersByExpireAtHandler implements IQueryHandler<GetUsersByExpireAtQuery> {
    private readonly logger = new Logger(GetUsersByExpireAtHandler.name);
    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(query: GetUsersByExpireAtQuery) {
        try {
            const users = await this.usersRepository.findUsersByExpireAt(query.start, query.end);

            return ok(users);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

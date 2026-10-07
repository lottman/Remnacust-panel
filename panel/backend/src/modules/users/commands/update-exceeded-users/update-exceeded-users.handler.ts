import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';

import { UsersRepository } from '../../repositories/users.repository';
import { UpdateExceededTrafficUsersCommand } from './update-exceeded-users.command';

@CommandHandler(UpdateExceededTrafficUsersCommand)
export class UpdateExceededTrafficUsersHandler implements ICommandHandler<
    UpdateExceededTrafficUsersCommand,
    TResult<{ id: bigint }[]>
> {
    public readonly logger = new Logger(UpdateExceededTrafficUsersHandler.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(): Promise<TResult<{ id: bigint }[]>> {
        try {
            const result = await this.usersRepository.updateExceededTrafficUsers();

            return ok(result);
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_EXCEEDED_TRAFFIC_USERS_ERROR);
        }
    }
}

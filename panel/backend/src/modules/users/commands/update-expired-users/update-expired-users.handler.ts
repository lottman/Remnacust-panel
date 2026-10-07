import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';

import { UsersRepository } from '../../repositories/users.repository';
import { UpdateExpiredUsersCommand } from './update-expired-users.command';

@CommandHandler(UpdateExpiredUsersCommand)
export class UpdateExpiredUsersHandler implements ICommandHandler<
    UpdateExpiredUsersCommand,
    TResult<{ id: bigint }[]>
> {
    public readonly logger = new Logger(UpdateExpiredUsersHandler.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(): Promise<TResult<{ id: bigint }[]>> {
        try {
            const result = await this.usersRepository.updateExpiredUsers();

            return ok(result);
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_USER_ERROR);
        }
    }
}

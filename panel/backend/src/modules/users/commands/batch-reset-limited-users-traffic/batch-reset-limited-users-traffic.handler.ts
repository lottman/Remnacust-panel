import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, ok } from '@common/types';

import { UsersRepository } from '../../repositories/users.repository';
import { BatchResetLimitedUsersTrafficCommand } from './batch-reset-limited-users-traffic.command';

@CommandHandler(BatchResetLimitedUsersTrafficCommand)
export class BatchResetLimitedUsersTrafficHandler implements ICommandHandler<BatchResetLimitedUsersTrafficCommand> {
    public readonly logger = new Logger(BatchResetLimitedUsersTrafficHandler.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(command: BatchResetLimitedUsersTrafficCommand) {
        try {
            const result = await this.usersRepository.resetLimitedUserTraffic(command.strategy);

            return ok(result);
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.UPDATE_USER_ERROR);
        }
    }
}

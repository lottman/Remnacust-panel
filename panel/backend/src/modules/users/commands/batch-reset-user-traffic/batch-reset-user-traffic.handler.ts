import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UsersRepository } from '../../repositories/users.repository';
import { BatchResetUserTrafficCommand } from './batch-reset-user-traffic.command';

@CommandHandler(BatchResetUserTrafficCommand)
export class BatchResetUserTrafficHandler implements ICommandHandler<BatchResetUserTrafficCommand> {
    public readonly logger = new Logger(BatchResetUserTrafficHandler.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(command: BatchResetUserTrafficCommand) {
        try {
            await this.usersRepository.resetUserTraffic(command.strategy);

            return;
        } catch (error: unknown) {
            this.logger.error(error);
            return;
        }
    }
}

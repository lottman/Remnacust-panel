import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';

import { UsersRepository } from '../../repositories/users.repository';
import { BulkDeleteByStatusCommand } from './bulk-delete-by-status.command';

@CommandHandler(BulkDeleteByStatusCommand)
export class BulkDeleteByStatusHandler implements ICommandHandler<
    BulkDeleteByStatusCommand,
    TResult<{ deletedCount: number }>
> {
    public readonly logger = new Logger(BulkDeleteByStatusHandler.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(command: BulkDeleteByStatusCommand): Promise<TResult<{ deletedCount: number }>> {
        try {
            const result = await this.usersRepository.deleteManyByStatus(
                command.status,
                command.limit,
            );

            return ok({ deletedCount: result });
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.BULK_DELETE_BY_STATUS_ERROR);
        }
    }
}

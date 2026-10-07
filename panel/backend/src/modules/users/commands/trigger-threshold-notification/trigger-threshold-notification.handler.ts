import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';

import { UsersRepository } from '../../repositories/users.repository';
import { TriggerThresholdNotificationCommand } from './trigger-threshold-notification.command';

@CommandHandler(TriggerThresholdNotificationCommand)
export class TriggerThresholdNotificationHandler implements ICommandHandler<
    TriggerThresholdNotificationCommand,
    TResult<{ id: bigint }[]>
> {
    public readonly logger = new Logger(TriggerThresholdNotificationHandler.name);

    constructor(private readonly usersRepository: UsersRepository) {}

    async execute(
        command: TriggerThresholdNotificationCommand,
    ): Promise<TResult<{ id: bigint }[]>> {
        try {
            const result = await this.usersRepository.triggerThresholdNotifications(
                command.percentages,
            );

            return ok(result);
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.TRIGGER_THRESHOLD_NOTIFICATION_ERROR);
        }
    }
}

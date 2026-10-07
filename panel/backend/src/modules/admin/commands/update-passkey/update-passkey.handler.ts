import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, TResult, ok } from '@common/types';

import { PasskeyEntity } from '@modules/admin/entities';
import { PasskeyRepository } from '@modules/admin/repositories/passkey.repository';

import { UpdatePasskeyCommand } from './update-passkey.command';

@CommandHandler(UpdatePasskeyCommand)
export class UpdatePasskeyHandler implements ICommandHandler<
    UpdatePasskeyCommand,
    TResult<PasskeyEntity>
> {
    public readonly logger = new Logger(UpdatePasskeyHandler.name);

    constructor(private readonly passkeyRepository: PasskeyRepository) {}

    async execute(command: UpdatePasskeyCommand): Promise<TResult<PasskeyEntity>> {
        try {
            const result = await this.passkeyRepository.update(
                { id: command.id, ...command.data },
                command.expectedCounter,
            );

            return ok(result);
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

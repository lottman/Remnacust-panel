import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, TResult, ok } from '@common/types';

import { PasskeyEntity } from '@modules/admin/entities';
import { PasskeyRepository } from '@modules/admin/repositories/passkey.repository';

import { CreatePasskeyCommand } from './create-passkey.command';

@CommandHandler(CreatePasskeyCommand)
export class CreatePasskeyHandler implements ICommandHandler<
    CreatePasskeyCommand,
    TResult<PasskeyEntity>
> {
    public readonly logger = new Logger(CreatePasskeyHandler.name);

    constructor(private readonly passkeyRepository: PasskeyRepository) {}

    async execute(command: CreatePasskeyCommand): Promise<TResult<PasskeyEntity>> {
        try {
            const result = await this.passkeyRepository.create(command.passkeyEntity);

            return ok(result);
        } catch (error: unknown) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_ADMIN_ERROR);
        }
    }
}

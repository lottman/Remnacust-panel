import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { UsersRepository } from '../../repositories/users.repository';
import { ResumeFrozenUsersCommand } from './resume-frozen-users.command';

@CommandHandler(ResumeFrozenUsersCommand)
export class ResumeFrozenUsersHandler implements ICommandHandler<ResumeFrozenUsersCommand> {
    constructor(private readonly users: UsersRepository) {}

    execute(): Promise<number> {
        return this.users.resumeScheduledFrozenUsers();
    }
}

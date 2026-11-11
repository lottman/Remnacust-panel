import { Command } from '@nestjs/cqrs';

export class ResumeFrozenUsersCommand extends Command<number> {}

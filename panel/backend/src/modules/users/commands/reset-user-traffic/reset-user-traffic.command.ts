import { Command } from '@nestjs/cqrs';

export class ResetUserTrafficCommand extends Command<void> {
    constructor(public readonly userId: number) {
        super();
    }
}

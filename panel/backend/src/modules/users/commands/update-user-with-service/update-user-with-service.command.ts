import { Command } from '@nestjs/cqrs';

import { UpdateUserBodyDto } from '@modules/users/dtos';

export class UpdateUserWithServiceCommand extends Command<void> {
    constructor(public readonly dto: UpdateUserBodyDto) {
        super();
    }
}

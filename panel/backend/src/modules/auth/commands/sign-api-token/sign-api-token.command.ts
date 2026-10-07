import { Command } from '@nestjs/cqrs';

import { TResult } from '@common/types';

export class SignApiTokenCommand extends Command<TResult<string>> {
    constructor(
        public readonly uuid: string,
        public readonly expireInDays: number,
    ) {
        super();
    }
}

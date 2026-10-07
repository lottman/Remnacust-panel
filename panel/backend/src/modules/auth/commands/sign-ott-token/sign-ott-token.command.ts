import { Command } from '@nestjs/cqrs';

import { TResult } from '@common/types';
import type { IJWTAuthPayload } from '@modules/auth/interfaces';

export class SignOttTokenCommand extends Command<TResult<string>> {
    constructor(public readonly parent: IJWTAuthPayload) {
        super();
    }
}

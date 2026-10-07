import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';

export class CheckHwidExistsQuery extends Query<TResult<{ exists: boolean; blocked: boolean }>> {
    constructor(
        public readonly hwid: string,
        public readonly userId: bigint,
    ) {
        super();
    }
}

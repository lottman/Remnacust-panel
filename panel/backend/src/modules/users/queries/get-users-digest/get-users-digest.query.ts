import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';

export class GetUsersDigestQuery extends Query<
    TResult<{ createdCount: number; expiredCount: number }>
> {
    constructor(
        public readonly start: Date,
        public readonly endExclusive: Date,
    ) {
        super();
    }
}

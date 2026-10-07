import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';

export class GetNewUsersTrafficQuery extends Query<TResult<bigint>> {
    constructor(
        public readonly start: Date,
        public readonly endExclusive: Date,
    ) {
        super();
    }
}

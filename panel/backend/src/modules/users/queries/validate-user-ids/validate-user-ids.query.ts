import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';

export class ValidateUserIdsQuery extends Query<TResult<bigint[]>> {
    constructor(public readonly userIds: number[] | bigint[]) {
        super();
    }
}

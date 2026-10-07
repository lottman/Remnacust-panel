import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';

import { GetTrafficPathsCommand } from '@libs/contracts/commands';

export class GetUserTrafficPathsQuery extends Query<TResult<GetTrafficPathsCommand.Response['response']>> {
    constructor(public readonly userShortUuid?: string) {
        super();
    }
}

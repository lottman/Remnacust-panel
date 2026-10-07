import { Query } from '@nestjs/cqrs';

import { TResult } from '@common/types';
import { TSubscriptionTemplateType } from '@libs/contracts/constants';

export class GetCachedTemplateNameQuery extends Query<TResult<Readonly<string>>> {
    constructor(
        public readonly externalSquadUuid: string,
        public readonly templateType: TSubscriptionTemplateType,
    ) {
        super();
    }
}

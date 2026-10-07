import { Query } from '@nestjs/cqrs';

import { ExternalSquadEntity } from '@modules/external-squads/entities';

export class GetCachedExternalSquadSettingsQuery extends Query<Readonly<
    Pick<
        ExternalSquadEntity,
        | 'subscriptionSettings'
        | 'hostOverrides'
        | 'responseHeadersAdd'
        | 'responseHeadersRemove'
        | 'hwidSettings'
        | 'customRemarks'
    >
> | null> {
    constructor(public readonly externalSquadUuid: string) {
        super();
    }
}

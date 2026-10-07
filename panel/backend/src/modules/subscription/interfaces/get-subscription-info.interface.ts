import { ExternalSquadEntity } from '@modules/external-squads/entities/external-squad.entity';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings';
import { UserEntity } from '@modules/users/entities';

export interface IGetSubscriptionInfo {
    userEntity?: UserEntity;
    searchBy?: {
        uniqueField: string | bigint;
        uniqueFieldKey: 'username' | 'shortUuid' | 'id';
    };
    authenticated?: boolean;
    subscriptionSettingsRaw?: SubscriptionSettingsEntity;
    overrides?: {
        subscriptionSettings: SubscriptionSettingsEntity;
        hostsOverrides?: ExternalSquadEntity['hostOverrides'];
    } | null;
}

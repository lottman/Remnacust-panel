import type { ActiveExpiryPlan } from '../../subscription/utils/active-expiry-remarks';

import { ExternalSquadEntity } from '@modules/external-squads/entities/external-squad.entity';
import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { ISRRContext } from '@modules/subscription-response-rules/interfaces';
import { UserEntity } from '@modules/users/entities/user.entity';

export interface IGenerateSubscription {
    onResolvedHosts?: (hostUuids: string[], invalidHostUuids?: string[]) => void;
    profileTitle?: string;
    profileKey?: string;
    srrContext: ISRRContext;
    user: UserEntity;
    hosts: HostWithRawInbound[];
    autoselectHosts?: HostWithRawInbound[];
    activeExpiryPlan?: ActiveExpiryPlan | null;
    hostsOverrides?: ExternalSquadEntity['hostOverrides'];
    fallbackOptions?: {
        showHwidMaxDeviceRemarks?: boolean;
        showHwidNotSupportedRemarks?: boolean;
        showHwidBlockedRemarks?: boolean;
        showHwidRegistrationBlockedRemarks?: boolean;
        respondWithRemarks?: string[];
    };
}

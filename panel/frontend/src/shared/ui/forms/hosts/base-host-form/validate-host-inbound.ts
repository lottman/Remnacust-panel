import { GetConfigProfilesCommand, UpdateHostCommand } from '@remnawave/backend-contract'
import i18n from 'i18next'

import { resolveHostInbound } from '@shared/utils/host-inbound'

export function validateHostInbound(
    inbound: UpdateHostCommand.RequestBody['inbound'],
    profiles: GetConfigProfilesCommand.Response['response']['configProfiles'] | undefined,
    required = false
) {
    if (!required && inbound === undefined) return {}

    if (!resolveHostInbound(inbound, profiles)) {
        const message = i18n.t(
            'create-host-modal.widget.please-select-the-config-profile-and-inbound'
        )
        return {
            'inbound.configProfileUuid': message,
            'inbound.configProfileInboundUuid': message
        }
    }

    return {}
}

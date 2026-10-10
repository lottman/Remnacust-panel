import { GetConfigProfilesCommand, UpdateHostCommand } from '@remnawave/backend-contract'
import i18n from 'i18next'

export function validateHostInbound(
    inbound: UpdateHostCommand.RequestBody['inbound'],
    profiles: GetConfigProfilesCommand.Response['response']['configProfiles'] | undefined,
    required = false
) {
    if (!required && inbound === undefined) return {}

    const profile = profiles?.find((profile) => profile.uuid === inbound?.configProfileUuid)
    if (
        !inbound?.configProfileInboundUuid ||
        !profile?.inbounds.some((item) => item.uuid === inbound.configProfileInboundUuid)
    ) {
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

import type { GetConfigProfilesCommand } from '@remnawave/backend-contract'

import { isValidUuid } from '@shared/utils/misc/is'

export type HostConfigProfiles = GetConfigProfilesCommand.Response['response']['configProfiles']

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

export function resolveHostInbound(binding: unknown, profiles: HostConfigProfiles | undefined) {
    if (
        !isRecord(binding) ||
        typeof binding.configProfileUuid !== 'string' ||
        typeof binding.configProfileInboundUuid !== 'string' ||
        !isValidUuid(binding.configProfileUuid) ||
        !isValidUuid(binding.configProfileInboundUuid) ||
        !Array.isArray(profiles)
    )
        return undefined

    const profileUuid = binding.configProfileUuid.toLowerCase()
    const inboundUuid = binding.configProfileInboundUuid.toLowerCase()
    const matchingProfiles = profiles.filter(
        (profile) =>
            isRecord(profile) &&
            typeof profile.uuid === 'string' &&
            profile.uuid.toLowerCase() === profileUuid
    )
    if (matchingProfiles.length !== 1) return undefined
    const profile = matchingProfiles[0]
    if (!Array.isArray(profile.inbounds)) return undefined

    const matchingInbounds = profile.inbounds.filter(
        (inbound) =>
            isRecord(inbound) &&
            typeof inbound.uuid === 'string' &&
            inbound.uuid.toLowerCase() === inboundUuid
    )
    if (matchingInbounds.length !== 1) return undefined
    const inbound = matchingInbounds[0]
    if (
        typeof inbound.profileUuid !== 'string' ||
        inbound.profileUuid.toLowerCase() !== profileUuid ||
        typeof inbound.tag !== 'string' ||
        !inbound.tag.trim()
    )
        return undefined

    const profileLabel =
        typeof profile.name === 'string' && profile.name.trim() ? profile.name : profile.uuid

    return { profile, inbound, profileLabel }
}

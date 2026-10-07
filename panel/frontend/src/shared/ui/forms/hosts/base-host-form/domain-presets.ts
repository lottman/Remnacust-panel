import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { normalizeDestinationRule } from '@shared/utils/destination-rule'

// Telegram's published DC networks: https://core.telegram.org/resources/cidr.txt
// ChatGPT: https://help.openai.com/en/articles/9247338
export const DOMAIN_PRESETS = [
    {
        id: 'telegram',
        label: 'Telegram',
        domains: [
            'telegram.org',
            't.me',
            'telegram.me',
            'telegra.ph',
            'telesco.pe',
            '91.108.56.0/22',
            '91.108.4.0/22',
            '91.108.8.0/22',
            '91.108.16.0/22',
            '91.108.12.0/22',
            '149.154.160.0/20',
            '91.105.192.0/23',
            '91.108.20.0/22',
            '185.76.151.0/24',
            '2001:b28:f23d::/48',
            '2001:b28:f23f::/48',
            '2001:67c:4e8::/48',
            '2001:b28:f23c::/48',
            '2a0a:f280::/32'
        ]
    },
    {
        id: 'chatgpt',
        label: 'ChatGPT',
        domains: [
            'chatgpt.com',
            'openai.com',
            'oaistatic.com',
            'oaiusercontent.com',
            'oaistatsig.com',
            'cdn.openaimerge.com',
            'challenges.cloudflare.com',
            'cdn.workos.com',
            'forwarder.workos.com',
            'images.workoscdn.com',
            'setup.workos.com',
            'workos.imgix.net'
        ]
    },
    {
        id: 'social',
        get label() {
            return uiText('message-325906e')
        },
        domains: [
            'instagram.com',
            'cdninstagram.com',
            'facebook.com',
            'fbcdn.net',
            'messenger.com',
            'threads.net',
            'threads.com',
            'x.com',
            'twitter.com',
            't.co',
            'twimg.com',
            'vk.com',
            'vk.ru',
            'vkuseraudio.net',
            'vkuserlive.net',
            'userapi.com'
        ]
    },
    {
        id: 'youtube',
        label: 'YouTube',
        domains: [
            'youtube.com',
            'youtu.be',
            'ytimg.com',
            'googlevideo.com',
            'youtubei.googleapis.com',
            'youtube-nocookie.com',
            'ggpht.com'
        ]
    },
    {
        id: 'discord',
        label: 'Discord',
        domains: ['discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media']
    }
] as const

export type PresetState = { manual: string[]; selected: string[] }
const key = (value: string) => {
    try {
        return normalizeDestinationRule(value)
    } catch {
        return value
    }
}
export function presetDomains(state: PresetState): string[] {
    return [
        ...new Set(
            [
                ...state.manual,
                ...DOMAIN_PRESETS.filter((p) => state.selected.includes(p.id)).flatMap((p) => [
                    ...p.domains
                ])
            ].map(key)
        )
    ]
}
export function inferPresetState(domains: string[]): PresetState {
    const entries = new Set(domains.map(key))
    const selected = DOMAIN_PRESETS.filter((p) => p.domains.every((d) => entries.has(d))).map(
        (p) => p.id
    )
    const owned = new Set(presetDomains({ manual: [], selected }))
    return { selected, manual: [...entries].filter((d) => !owned.has(d)) }
}
export function togglePreset(state: PresetState, id: string): PresetState {
    return {
        ...state,
        selected: state.selected.includes(id)
            ? state.selected.filter((item) => item !== id)
            : [...state.selected, id]
    }
}
export function editPresetDomains(state: PresetState, values: string[]): PresetState {
    const entries = new Set(values.map(key))
    const selected = state.selected.filter((id) =>
        DOMAIN_PRESETS.find((p) => p.id === id)!.domains.every((d) => entries.has(d))
    )
    const owned = new Set(presetDomains({ manual: [], selected }))
    const manual = new Set(state.manual.map(key))
    return {
        selected,
        manual: [...entries].filter((d) => manual.has(d) || !owned.has(d))
    }
}

export function validateHostDomainRules(values: {
    domainRules?: { domains?: string[]; mode?: string } | null
}) {
    if (values.domainRules?.mode === 'OFF') return {}
    try {
        values.domainRules?.domains?.forEach(normalizeDestinationRule)
        return {}
    } catch {
        return { domainRules: uiText('enter-valid-domain-ip-or-cidr-f42b6cd') }
    }
}

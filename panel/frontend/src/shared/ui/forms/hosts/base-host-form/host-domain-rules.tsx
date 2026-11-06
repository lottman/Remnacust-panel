import { ActionIcon, Button, Group, Stack, TagsInput, Tooltip } from '@mantine/core'
import { useState } from 'react'
import {
    TbBrandOpenai,
    TbBrandTelegram,
    TbBrandYoutube,
    TbBrandDiscord,
    TbUsers,
    TbInfoCircle,
    TbWorld,
    TbCheck
} from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { normalizeDestinationRule } from '@shared/utils/destination-rule'

import {
    DOMAIN_PRESETS,
    editPresetDomains,
    inferPresetState,
    presetDomains,
    togglePreset
} from './domain-presets'

const icons = [TbBrandTelegram, TbBrandOpenai, TbUsers, TbBrandYoutube, TbBrandDiscord]

export function HostDomainRules({
    value,
    onChange,
    mode
}: {
    value: string[]
    onChange: (value: string[]) => void
    mode: string
}) {
    const uiText = useUiText()

    const [savedPresets, setPresets] = useState(() => inferPresetState(value))
    // A reset is derived from the new form values without a second effect-driven render.
    const presets =
        JSON.stringify(presetDomains(savedPresets)) === JSON.stringify(value)
            ? savedPresets
            : inferPresetState(value)
    let error: string | undefined
    for (const domain of value) {
        try {
            normalizeDestinationRule(domain)
        } catch {
            error = uiText('invalid-destination-c414988') + domain.slice(0, 80)
            break
        }
    }
    const hint = uiText('domains-include-subdomains-http-s-urls-ipv4-ipv6-cidr-and-inte-bd63ed5')
    return (
        <Stack gap={8}>
            <TagsInput
                label={uiText('domains-and-ips-813c598')}
                description={
                    mode === 'ALLOW_ONLY'
                        ? uiText('allow-only-selected-destinations-8f26f18')
                        : uiText('block-selected-destinations-b979531')
                }
                placeholder={
                    value.length
                        ? uiText('add-destination-48b7df1')
                        : 'example.com, 149.154.160.0/20'
                }
                leftSection={<TbWorld size={16} />}
                rightSection={
                    <Tooltip
                        label={hint}
                        multiline
                        w={300}
                        withArrow
                        events={{ hover: true, focus: true, touch: true }}
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={uiText('address-and-ping-help-2b2063f')}
                        >
                            <TbInfoCircle size={17} />
                        </ActionIcon>
                    </Tooltip>
                }
                styles={{ input: { maxHeight: 160, overflowY: 'auto' } }}
                splitChars={[',', ';', '\n']}
                value={value}
                error={error}
                onChange={(domains) => {
                    const next = editPresetDomains(presets, domains)
                    setPresets(next)
                    onChange(presetDomains(next))
                }}
            />
            <Group gap={6} role="group" aria-label={uiText('destination-presets-27cd6c9')}>
                {DOMAIN_PRESETS.map((preset, index) => {
                    const selected = presets.selected.includes(preset.id)
                    const Icon = selected ? TbCheck : icons[index]
                    const full =
                        !selected && presetDomains(togglePreset(presets, preset.id)).length > 200
                    return (
                        <Tooltip
                            key={preset.id}
                            label={preset.domains.join(', ')}
                            multiline
                            w={300}
                            withArrow
                            openDelay={500}
                        >
                            <Button
                                size="xs"
                                variant={selected ? 'light' : 'default'}
                                aria-pressed={selected}
                                disabled={full}
                                leftSection={<Icon size={14} />}
                                onClick={() => {
                                    const next = togglePreset(presets, preset.id)
                                    if (presetDomains(next).length > 200) return
                                    setPresets(next)
                                    onChange(presetDomains(next))
                                }}
                            >
                                {preset.label}
                            </Button>
                        </Tooltip>
                    )
                })}
            </Group>
        </Stack>
    )
}

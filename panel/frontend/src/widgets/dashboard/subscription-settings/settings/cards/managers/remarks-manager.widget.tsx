import { useAutoAnimate } from '@formkit/auto-animate/react'
import {
    ActionIcon,
    Button,
    Card,
    DefaultMantineColor,
    Divider,
    Group,
    Menu,
    Stack,
    Text,
    TextInput,
    ThemeIcon
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiPlus, PiTrash, PiArrowUp, PiArrowDown, PiLink, PiGlobe } from 'react-icons/pi'

import { useUiText } from '@shared/i18n/interface-text'
import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'
import { FlagTextInput } from '@shared/ui/flag-picker/flag-picker'
import { TemplateInfoPopoverShared } from '@shared/ui/popovers/template-info-popover/template-info-popover.shared'

const EMPTY_REMARKS = ['']

export const RemarksManager = ({
    initialRemarks = EMPTY_REMARKS,
    title,
    onChange,
    icon,
    iconColor
}: {
    icon: React.ReactNode
    iconColor: DefaultMantineColor
    initialRemarks?: string[]
    onChange: (remarks: string[]) => void
    title: string
}) => {
    const uiText = useUiText()

    const [localRemarks, setLocalRemarks] = useState<string[]>(initialRemarks)
    const { t } = useTranslation()

    const reducedMotion = usePanelReducedMotion()
    const [parent, enableAnimation] = useAutoAnimate((el, action) => {
        let keyframes: Keyframe[] | undefined
        if (action === 'add') {
            keyframes = [
                { transform: 'scale(.98)', opacity: 0 },
                { transform: 'scale(1)', opacity: 1 }
            ]
        }
        if (action === 'remove') {
            keyframes = [
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(.98)', opacity: 0 }
            ]
        }
        if (action === 'remain') {
            keyframes = [{ opacity: 0.98 }, { opacity: 1 }]
        }

        return new KeyframeEffect(el, keyframes as Keyframe[], {
            duration: 160,
            easing: 'ease-in-out'
        })
    })

    useEffect(() => enableAnimation(!reducedMotion), [enableAnimation, reducedMotion])

    const [previousRemarks, setPreviousRemarks] = useState(initialRemarks)
    if (previousRemarks !== initialRemarks) {
        setPreviousRemarks(initialRemarks)
        setLocalRemarks(initialRemarks)
    }

    const commit = (next: string[]) => {
        setLocalRemarks(next)
        onChange(next)
    }
    const addLocalRemark = (value = '') => commit([...localRemarks, value])
    const removeLocalRemark = (index: number) => {
        const next = localRemarks.filter((_, i) => i !== index)
        commit(next.length ? next : [''])
    }
    const updateLocalRemark = (index: number, value: string) =>
        commit(localRemarks.map((item, i) => (i === index ? value : item)))
    const move = (index: number, delta: number) => {
        const next = [...localRemarks]
        ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
        commit(next)
    }
    const linkValue = (
        remark: string
    ): { type: 'link'; text: string; buttonText: string; url: string } | null => {
        try {
            const value = JSON.parse(remark)
            return value?.type === 'link' ? value : null
        } catch {
            return null
        }
    }

    return (
        <Card>
            <Stack gap="md">
                <Group align="center" gap="xs" justify="space-between" wrap="nowrap">
                    <Group align="center" gap="xs" wrap="nowrap">
                        <ThemeIcon color={iconColor} size="lg" variant="light">
                            {icon}
                        </ThemeIcon>
                        <Text fw={600} size="md">
                            {title}
                        </Text>
                    </Group>

                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                            <Button leftSection={<PiPlus size="16px" />} size="sm" variant="light">
                                {t('common.action.add')}
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item onClick={() => addLocalRemark()}>
                                {uiText('text-71988c4')}
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<PiLink />}
                                onClick={() =>
                                    addLocalRemark(
                                        JSON.stringify({
                                            type: 'link',
                                            text: '',
                                            buttonText: uiText('learn-more-1445799'),
                                            url: ''
                                        })
                                    )
                                }
                            >
                                {uiText('link-with-button-e7deb61')}
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<PiGlobe />}
                                onClick={() => addLocalRemark('{{FREE_HOST}}')}
                            >
                                {uiText('available-hosts-66c64ba')}
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>

                <Divider />

                <Stack gap="xs" ref={parent}>
                    {localRemarks.map((remark, index) => {
                        const link = linkValue(remark)
                        return (
                            <Group align="flex-start" gap="sm" key={index}>
                                {link ? (
                                    <Stack gap="xs" style={{ flex: 1 }}>
                                        <TextInput
                                            label={uiText('text-71988c4')}
                                            maxLength={500}
                                            value={link.text}
                                            onChange={(e) =>
                                                updateLocalRemark(
                                                    index,
                                                    JSON.stringify({
                                                        ...link,
                                                        text: e.currentTarget.value
                                                    })
                                                )
                                            }
                                        />
                                        <FlagTextInput
                                            required
                                            label={uiText('button-text-ec208ea')}
                                            maxLength={60}
                                            value={link.buttonText}
                                            onChange={(e) =>
                                                updateLocalRemark(
                                                    index,
                                                    JSON.stringify({
                                                        ...link,
                                                        buttonText: e.currentTarget.value
                                                    })
                                                )
                                            }
                                        />
                                        <TextInput
                                            required
                                            type="url"
                                            label={uiText('https-url-c3cf95f')}
                                            placeholder="https://"
                                            maxLength={2048}
                                            value={link.url}
                                            onChange={(e) =>
                                                updateLocalRemark(
                                                    index,
                                                    JSON.stringify({
                                                        ...link,
                                                        url: e.currentTarget.value
                                                    })
                                                )
                                            }
                                        />
                                    </Stack>
                                ) : (
                                    <FlagTextInput
                                        rightSection={<TemplateInfoPopoverShared compact />}
                                        onChange={(e) => updateLocalRemark(index, e.target.value)}
                                        placeholder={t('remarks-manager.widget.enter-remark')}
                                        style={{ flex: 1 }}
                                        value={remark}
                                        description={
                                            remark.trim() === '{{FREE_HOST}}'
                                                ? uiText(
                                                      'marked-hosts-appear-at-this-position-3b9cd38'
                                                  )
                                                : undefined
                                        }
                                    />
                                )}
                                <Stack gap={2}>
                                    <ActionIcon
                                        variant="subtle"
                                        aria-label={uiText('move-up-c66feb5')}
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        <PiArrowUp />
                                    </ActionIcon>
                                    <ActionIcon
                                        variant="subtle"
                                        aria-label={uiText('move-down-40bb50d')}
                                        disabled={index === localRemarks.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        <PiArrowDown />
                                    </ActionIcon>
                                </Stack>
                                <ActionIcon
                                    color="red"
                                    disabled={localRemarks.length === 1}
                                    onClick={() => removeLocalRemark(index)}
                                    size="lg"
                                    variant="light"
                                >
                                    <PiTrash size="16px" />
                                </ActionIcon>
                            </Group>
                        )
                    })}
                </Stack>
            </Stack>
        </Card>
    )
}

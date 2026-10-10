import {
    ActionIcon,
    CopyButton,
    Group,
    ScrollArea,
    Stack,
    Text,
    Textarea,
    TextareaProps,
    TextInput,
    TextInputProps,
    Tooltip,
    UnstyledButton
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { forwardRef, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCheck, TbFlag, TbSearch } from 'react-icons/tb'

import { COUNTRY_FLAG_CODES } from './country-flag-codes'
import classes from './flag-picker.module.css'

export function CountryFlagPicker() {
    const { t, i18n } = useTranslation()
    const [search, setSearch] = useState('')
    const countries = useMemo(() => {
        let names: Intl.DisplayNames
        try {
            names = new Intl.DisplayNames([i18n.language, 'en'], { type: 'region' })
        } catch {
            names = new Intl.DisplayNames(['en'], { type: 'region' })
        }
        return COUNTRY_FLAG_CODES.map((code) => ({
            value: code,
            flag: String.fromCodePoint(
                ...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)
            ),
            name: code === 'CQ' ? t('flag-picker.sark') : (names.of(code) ?? code)
        })).sort((a, b) => a.name.localeCompare(b.name, i18n.language))
    }, [i18n.language, t])
    const query = search.trim().toLocaleLowerCase(i18n.language)
    const filtered = countries.filter((entry) =>
        `${entry.name} ${entry.value}`.toLocaleLowerCase(i18n.language).includes(query)
    )
    return (
        <Stack gap="sm">
            <TextInput
                autoFocus
                label={t('flag-picker.search')}
                leftSection={<TbSearch size={18} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Text size="xs" c="dimmed">
                {t('flag-picker.hint')}
            </Text>
            <ScrollArea.Autosize mah="min(440px, 55dvh)" offsetScrollbars>
                <div className={classes.list}>
                    {filtered.map((entry) => {
                        return (
                            <CopyButton key={entry.value} value={entry.flag}>
                                {({ copied, copy }) => (
                                    <UnstyledButton
                                        className={classes.country}
                                        onClick={copy}
                                        aria-label={`${t('common.action.copy')}: ${entry.name} (${entry.value})`}
                                    >
                                        <span className={classes.flag} aria-hidden="true">
                                            {entry.flag}
                                        </span>
                                        <span className={classes.name}>{entry.name}</span>
                                        <Text c="dimmed" size="xs">
                                            {entry.value}
                                        </Text>
                                        {copied && (
                                            <TbCheck
                                                size={18}
                                                color="var(--mantine-color-teal-6)"
                                                aria-label={t('common.message.copied')}
                                            />
                                        )}
                                    </UnstyledButton>
                                )}
                            </CopyButton>
                        )
                    })}
                </div>
                {filtered.length === 0 && (
                    <Text c="dimmed" ta="center" py="lg">
                        {t('flag-picker.empty')}
                    </Text>
                )}
            </ScrollArea.Autosize>
        </Stack>
    )
}

export function FlagPickerButton({ disabled }: { disabled?: boolean }) {
    const { t } = useTranslation()
    return (
        <Tooltip label={t('flag-picker.open')}>
            <ActionIcon
                aria-label={t('flag-picker.open')}
                color="blue"
                size={30}
                variant="soft"
                disabled={disabled}
                onClick={() =>
                    modals.open({
                        title: t('flag-picker.title'),
                        centered: true,
                        size: 500,
                        children: <CountryFlagPicker />
                    })
                }
            >
                <TbFlag size={18} />
            </ActionIcon>
        </Tooltip>
    )
}

function sections(props: TextInputProps | TextareaProps) {
    const extraWidth = props.rightSection
        ? typeof props.rightSectionWidth === 'number'
            ? Math.max(44, props.rightSectionWidth)
            : 44
        : 0
    return {
        rightSection: (
            <Group gap={4} wrap="nowrap">
                {props.rightSection}
                <FlagPickerButton disabled={props.disabled || props.readOnly} />
            </Group>
        ),
        rightSectionWidth: 44 + extraWidth,
        rightSectionPointerEvents: 'auto' as const
    }
}

export const FlagTextInput = forwardRef<HTMLInputElement, TextInputProps>((props, ref) => (
    <TextInput {...props} {...sections(props)} ref={ref} />
))
FlagTextInput.displayName = 'FlagTextInput'
export const FlagTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => (
    <Textarea {...props} {...sections(props)} ref={ref} />
))
FlagTextarea.displayName = 'FlagTextarea'

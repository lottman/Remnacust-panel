import { TextInput } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import dayjs from 'dayjs'
import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiCalendarDuotone } from 'react-icons/pi'

export function freezeDeadlineDate(value: unknown): Date | null {
    const date =
        value instanceof Date ? value : typeof value === 'string' ? dayjs(value).toDate() : null
    return date && Number.isFinite(date.getTime()) ? date : null
}

export function validFreezeDeadline(value: unknown, now = Date.now()): boolean {
    const deadline = freezeDeadlineDate(value)
    return deadline !== null && deadline.getTime() > now
}

export function FreezeScheduleField({
    value,
    onChange,
    readOnly = false,
    error
}: {
    value: unknown
    onChange: (value: Date | null) => void
    readOnly?: boolean
    error?: ReactNode
}) {
    const { t, i18n } = useTranslation()
    const [minimumDate] = useState(() => new Date())
    const deadline = freezeDeadlineDate(value)
    if (readOnly)
        return (
            <TextInput
                data-freeze-schedule="saved"
                label={t('frozen-user.until')}
                description={t('frozen-user.until-saved-help')}
                value={
                    deadline
                        ? new Intl.DateTimeFormat(i18n.language, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              calendar: 'gregory'
                          }).format(deadline)
                        : ''
                }
                readOnly
                leftSection={<PiCalendarDuotone size={16} />}
                styles={{ input: { color: 'var(--mantine-color-blue-5)' } }}
            />
        )
    return (
        <DateTimePicker
            data-freeze-schedule="editing"
            label={t('frozen-user.until')}
            description={t('frozen-user.until-help')}
            placeholder={t('frozen-user.until-placeholder')}
            value={deadline ? dayjs(deadline).format('YYYY-MM-DD HH:mm:ss') : null}
            onChange={(next) => onChange(freezeDeadlineDate(next))}
            minDate={minimumDate}
            locale={i18n.language}
            valueFormat="D MMM YYYY, HH:mm"
            dropdownType="modal"
            modalProps={{ centered: true }}
            leftSection={<PiCalendarDuotone size={16} />}
            error={error}
            required
        />
    )
}

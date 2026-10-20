import { Badge, Group, Text, UnstyledButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle, TbCalendar, TbClock, TbCreditCard } from 'react-icons/tb'

import { formatTimeUtil } from '@shared/utils/time-utils'

import { getBillingDateStatus } from './billing-date-status'
import classes from './billing-date-status.module.css'

interface Props {
    date: Date | string
    today: Date
    onEdit?: () => void
}

export function BillingDateStatusRow({ date, today, onEdit }: Props) {
    const { t, i18n } = useTranslation()
    const status = getBillingDateStatus(date, today)
    const label =
        status.daysRemaining === null
            ? t('billing-date-status.date-unavailable')
            : status.state === 'overdue'
              ? t('billing-date-status.overdue', { count: -status.daysRemaining })
              : status.state === 'today'
                ? t('billing-date-status.due-today')
                : status.state === 'urgent'
                  ? t('billing-date-status.due-tomorrow')
                  : t('billing-date-status.remaining', { count: status.daysRemaining })
    const dateLabel =
        status.daysRemaining === null
            ? t('billing-date-status.date-unavailable')
            : formatTimeUtil({
                  time: date,
                  template: 'FULL_DATE',
                  language: i18n.language,
                  utc: true
              })
    const Icon =
        status.state === 'overdue'
            ? TbAlertTriangle
            : status.state === 'today' || status.state === 'urgent'
              ? TbClock
              : TbCreditCard

    return (
        <Group
            className={`${classes.statusColors} ${classes.statusRow}`}
            data-billing-state={status.state}
            justify="space-between"
        >
            {onEdit ? (
                <UnstyledButton
                    aria-label={t('billing-date-status.edit-date', { date: dateLabel })}
                    className={classes.dateButton}
                    onClick={onEdit}
                >
                    <TbCalendar aria-hidden size={16} />
                    <span>{dateLabel}</span>
                </UnstyledButton>
            ) : (
                <Text className={classes.dateButton} component="span">
                    <TbCalendar aria-hidden size={16} />
                    {dateLabel}
                </Text>
            )}
            <Badge
                className={classes.badge}
                classNames={{ label: classes.badgeLabel }}
                leftSection={<Icon aria-hidden size={14} />}
                radius="sm"
                size="sm"
                variant="default"
            >
                {label}
            </Badge>
        </Group>
    )
}

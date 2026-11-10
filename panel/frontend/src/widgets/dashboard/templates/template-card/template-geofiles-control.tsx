import type { GetSubscriptionTemplatesCommand } from '@remnawave/backend-contract'

import { Menu, ThemeIcon, Tooltip } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { subscriptionSettingsQueryKeys } from '@shared/api/hooks/subscription-settings/subscription-settings.query.hooks'
import { cacheCreatedTemplate } from '@shared/api/hooks/subscription-template/subscription-template-cache'
import { useUpdateSubscriptionTemplate } from '@shared/api/hooks/subscription-template/subscription-template.mutation.hooks'
import { subscriptionTemplateQueryKeys } from '@shared/api/hooks/subscription-template/subscription-template.query.hooks'
import { GeofileIcon } from '@shared/ui/geofile-icon/geofile-icon'

type Template = GetSubscriptionTemplatesCommand.Response['response']['templates'][number]

export function TemplateGeofilesStatus({ enabled }: { enabled: boolean }) {
    const { t } = useTranslation()
    const label = t(enabled ? 'geofiles.template-on' : 'geofiles.template-off')
    return (
        <Tooltip label={label} withArrow>
            <ThemeIcon
                aria-label={label}
                role="img"
                tabIndex={0}
                variant={enabled ? 'light' : 'transparent'}
                size={30}
                c={enabled ? 'var(--panel-accent)' : 'dimmed'}
            >
                <GeofileIcon disabled={!enabled} />
            </ThemeIcon>
        </Tooltip>
    )
}

export function TemplateGeofilesMenuItem({
    template,
    allowEnable,
    inactive = false
}: {
    template: Template
    allowEnable: boolean
    inactive?: boolean
}) {
    const { t } = useTranslation()
    const client = useQueryClient()
    const enabled = template.geofilesEnabled === true
    const update = useUpdateSubscriptionTemplate({
        mutationFns: {
            onSuccess: async (data) => {
                await cacheCreatedTemplate(
                    client,
                    subscriptionTemplateQueryKeys.getSubscriptionTemplates.queryKey,
                    data
                )
                client.setQueryData(
                    subscriptionTemplateQueryKeys.getSubscriptionTemplate({ uuid: data.uuid })
                        .queryKey,
                    data
                )
                await client.invalidateQueries({
                    queryKey: subscriptionSettingsQueryKeys.getSubscriptionSettings.queryKey
                })
            }
        }
    })
    const disabled = inactive || update.isPending || (!enabled && !allowEnable)
    return (
        <Tooltip label={t('geofiles.requires-json')} disabled={enabled || allowEnable} withArrow>
            <Menu.Item
                disabled={disabled}
                leftSection={<GeofileIcon disabled={!enabled} />}
                onClick={(event) => {
                    event.stopPropagation()
                    if (disabled) return
                    update.mutate({ variables: { uuid: template.uuid, geofilesEnabled: !enabled } })
                }}
            >
                {t(enabled ? 'geofiles.template-disable' : 'geofiles.template-enable')}
            </Menu.Item>
        </Tooltip>
    )
}

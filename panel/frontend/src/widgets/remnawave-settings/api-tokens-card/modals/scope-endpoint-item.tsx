import { Badge, Box, Checkbox, Group, Stack, Text } from '@mantine/core'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import classes from '../api-token-card.module.css'
import { getMethodColor, ScopeEndpoint } from './scopes.utils'

interface IProps {
    checked: boolean
    endpoint: ScopeEndpoint
    onToggle?: (key: string) => void
    readOnly?: boolean
}

export const ScopeEndpointItem = memo(({ checked, endpoint, onToggle, readOnly }: IProps) => {
    const { t } = useTranslation()
    const description =
        endpoint.key === 'limits:unlimited' ? t('limitsUnlimited.permission') : endpoint.description
    const isWrite = endpoint.kind === 'write'

    return (
        <Box
            className={classes.endpointRow}
            data-checked={checked || undefined}
            data-readonly={readOnly || undefined}
            role={readOnly ? undefined : 'checkbox'}
            aria-checked={readOnly ? undefined : checked}
            aria-label={
                readOnly ? undefined : `${endpoint.method} ${endpoint.path}: ${description}`
            }
            tabIndex={readOnly ? undefined : 0}
            onKeyDown={
                readOnly
                    ? undefined
                    : (event) => {
                          if (event.key === ' ' || event.key === 'Enter') {
                              event.preventDefault()
                              onToggle?.(endpoint.key)
                          }
                      }
            }
            onClick={readOnly ? undefined : () => onToggle?.(endpoint.key)}
        >
            <Group gap="sm" wrap="nowrap">
                {!readOnly && (
                    <Checkbox
                        aria-hidden
                        checked={checked}
                        readOnly
                        radius="sm"
                        size="xs"
                        tabIndex={-1}
                    />
                )}

                <Badge
                    className={classes.methodBadge}
                    color={getMethodColor(endpoint.method)}
                    ff="monospace"
                    radius="sm"
                    variant="soft"
                >
                    {endpoint.method}
                </Badge>

                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Text className={classes.endpointPath} truncate="end">
                        {endpoint.path}
                    </Text>
                    <Text c="dimmed" size="xs" truncate="end">
                        {description}
                    </Text>
                    <Text c="dimmed" ff="monospace" size="xs" truncate="end">
                        {endpoint.key}
                    </Text>
                </Stack>

                <Badge
                    color={isWrite ? 'orange' : 'blue'}
                    ff="monospace"
                    radius="sm"
                    variant="soft"
                >
                    {t(isWrite ? 'limitsUnlimited.write' : 'limitsUnlimited.read')}
                </Badge>
            </Group>
        </Box>
    )
})

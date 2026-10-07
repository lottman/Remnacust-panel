import { Badge, Box, Flex, Group, Paper, Stack, Text } from '@mantine/core'
import {
    GetSubscriptionSettingsCommand,
    TSubscriptionTemplateType
} from '@remnawave/backend-contract'
import { ResponseRulesEditorWidget } from '@widgets/dashboard/response-rules/response-rules-editor'
import { useTranslation } from 'react-i18next'
import { TbRoute } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { Page, PageHeaderShared } from '@shared/ui'
import { SrrAdvancedWarningOverlay } from '@shared/ui/srr-advanced-warning-overlay/srr-advanced-warning-overlay'

interface Props {
    groupedTemplates: Record<TSubscriptionTemplateType, string[]>
    responseRules: GetSubscriptionSettingsCommand.Response['response']['responseRules']
    subscriptionSettingsUuid: string
}

export const ResponseRulesPageComponent = (props: Props) => {
    const uiText = useUiText()

    const { groupedTemplates, responseRules, subscriptionSettingsUuid } = props

    const { t } = useTranslation()
    const allowedApplications = (responseRules?.rules ?? [])
        .filter(
            (rule) =>
                rule.enabled &&
                !['BLOCK', 'STATUS_CODE_404', 'STATUS_CODE_451', 'SOCKET_DROP'].includes(
                    rule.responseType
                )
        )
        .flatMap((rule) =>
            rule.conditions
                .filter(
                    (condition) =>
                        condition.headerName.toLowerCase() === 'user-agent' &&
                        !condition.operator.startsWith('NOT_')
                )
                .map((condition) => ({
                    name: condition.value,
                    operator: condition.operator,
                    rule: rule.name,
                    format: rule.responseType
                }))
        )

    return (
        <Page title={t('constants.response-rules')}>
            <PageHeaderShared icon={<TbRoute size={24} />} title={t('constants.response-rules')} />

            <SrrAdvancedWarningOverlay />

            <Paper mb="md" p="md" radius="md" withBorder>
                <Text fw={650} mb={4} size="sm">
                    {uiText('apps-in-delivery-rules-df2b121')}
                </Text>
                <Text c="dimmed" mb="sm" size="xs">
                    {uiText(
                        'user-agent-conditions-in-enabled-delivery-rules-the-actual-res-9346c0b'
                    )}
                </Text>
                {allowedApplications.length ? (
                    <Stack gap="xs">
                        {allowedApplications.map((application, index) => (
                            <Group
                                gap="xs"
                                key={`${application.rule}-${application.name}-${index}`}
                            >
                                <Badge color="brand" variant="light">
                                    {application.name}
                                </Badge>
                                <Text c="dimmed" size="xs">
                                    {application.operator} · {application.rule} →{' '}
                                    {application.format}
                                </Text>
                            </Group>
                        ))}
                    </Stack>
                ) : (
                    <Text c="dimmed" size="xs">
                        {uiText('no-explicit-user-agent-conditions-in-delivery-rules-a0c8775')}
                    </Text>
                )}
            </Paper>

            <Flex gap="md">
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <ResponseRulesEditorWidget
                        groupedTemplates={groupedTemplates}
                        responseRules={responseRules}
                        subscriptionSettingsUuid={subscriptionSettingsUuid}
                    />
                </Box>
            </Flex>
        </Page>
    )
}

import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip
} from '@mantine/core'
import { GetUserDomainLinksCommand } from '@remnawave/backend-contract'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { PiLinkDuotone } from 'react-icons/pi'
import { TbQrcode, TbRefresh } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { instance } from '@shared/api/axios'
import { CopyableFieldShared } from '@shared/ui/copyable-field/copyable-field'

type Props = {
    user: {
        id: number
        username: string
        subscriptionUrl: string
        subscriptionDomainUuid?: string | null
    }
}

export function UserDomainLinks({ user }: Props) {
    const { t } = useTranslation()
    const links = useQuery({
        queryKey: [
            'user-domain-links',
            user.id,
            user.subscriptionDomainUuid ?? null,
            user.subscriptionUrl
        ],
        queryFn: async () =>
            (
                await instance.get<GetUserDomainLinksCommand.Response>(
                    GetUserDomainLinksCommand.url(String(user.id))
                )
            ).data.response,
        staleTime: 15_000,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always'
    })
    const overLimit =
        isAxiosError(links.error) &&
        [links.error.response?.data?.code, links.error.response?.data?.errorCode].includes(
            'SUBSCRIPTION_DOMAIN_CDN_LIMIT'
        )
    return (
        <Stack gap="sm">
            <Group justify="space-between" gap="xs">
                <Text fw={500} size="sm">
                    {t('user-domain-links.title')}
                </Text>
                {links.isFetching ? (
                    <Loader size="xs" aria-label={t('user-domain-links.loading')} />
                ) : (
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label={t('user-domain-links.refresh')}
                        onClick={() => void links.refetch()}
                    >
                        <TbRefresh size={16} />
                    </ActionIcon>
                )}
            </Group>
            {links.isError && (
                <Alert color="red">
                    <Stack gap="xs">
                        <Text size="sm">
                            {t(
                                overLimit
                                    ? 'subscription-domains.cdn-limit'
                                    : 'user-domain-links.load-failed'
                            )}
                        </Text>
                        <Button size="xs" variant="light" onClick={() => void links.refetch()}>
                            {t('user-domain-links.retry')}
                        </Button>
                    </Stack>
                </Alert>
            )}
            {links.data?.links.map((link) => (
                <Group key={link.domainUuid} align="flex-end" gap="xs" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                        <CopyableFieldShared
                            label={
                                <Group gap={6} wrap="wrap">
                                    <Badge
                                        size="xs"
                                        variant={link.kind === 'CDN' ? 'light' : 'outline'}
                                    >
                                        {link.kind === 'CDN'
                                            ? 'CDN'
                                            : t('user-domain-links.primary')}
                                    </Badge>
                                    <Text
                                        component="span"
                                        size="xs"
                                        title={link.name}
                                        style={{ overflowWrap: 'anywhere' }}
                                    >
                                        {link.domain}
                                    </Text>
                                    {link.isSelected && (
                                        <Text component="span" c="dimmed" size="xs">
                                            {t('user-domain-links.selected')}
                                        </Text>
                                    )}
                                </Group>
                            }
                            leftSection={<PiLinkDuotone size={16} />}
                            value={link.url}
                        />
                    </Box>
                    <Tooltip label={t('view-user-modal.widget.qr-code')}>
                        <ActionIcon
                            size={36}
                            variant="light"
                            aria-label={`${t('view-user-modal.widget.qr-code')}: ${link.domain}`}
                            onClick={() =>
                                showModal('users_subscriptionQrCodeModal', {
                                    subscriptionUrl: link.url,
                                    username: user.username
                                })
                            }
                        >
                            <TbQrcode size={19} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ))}
            {!links.data?.links.length && (
                <CopyableFieldShared
                    label={t('user-domain-links.current')}
                    value={user.subscriptionUrl}
                    leftSection={<PiLinkDuotone size={16} />}
                />
            )}
        </Stack>
    )
}

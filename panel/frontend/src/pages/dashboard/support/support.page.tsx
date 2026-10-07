import { Button, Card, Text, Title } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { TbBrandTelegram, TbCheck, TbCopy, TbHeart } from 'react-icons/tb'

import { Page } from '@shared/ui'
import { PageHeaderShared } from '@shared/ui/page-header'

import { SUPPORT_WALLETS } from './support-wallets'
import classes from './support.module.css'

function WalletRow({ wallet }: { wallet: (typeof SUPPORT_WALLETS)[number] }) {
    const { t } = useTranslation()
    const clipboard = useClipboard({ timeout: 2000 })
    const Icon = wallet.icon
    const addressMiddle = Math.ceil(wallet.address.length / 2)

    return (
        <li className={classes.wallet}>
            <div className={classes.identity}>
                <span className={classes.coinIcon} aria-hidden="true">
                    <Icon size={23} />
                </span>
                <div>
                    <Title order={4} className={classes.coinName}>
                        {wallet.name}
                    </Title>
                    <Text className={classes.network} size="xs">
                        {t('project-support.network')}: {wallet.network}
                    </Text>
                </div>
            </div>
            <code className={classes.address} dir="ltr" data-wallet-address={wallet.id}>
                {wallet.address.slice(0, addressMiddle)}
                <wbr />
                {wallet.address.slice(addressMiddle)}
            </code>
            <Button
                variant="default"
                size="xs"
                className={classes.copyButton}
                aria-label={t('project-support.copy-address', { coin: wallet.name })}
                leftSection={clipboard.copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
                onClick={() => clipboard.copy(wallet.address)}
                data-copied={clipboard.copied || undefined}
            >
                <span aria-live="polite">
                    {t(clipboard.copied ? 'common.message.copied' : 'common.action.copy')}
                </span>
            </Button>
            {clipboard.error && (
                <Text className={classes.error} role="alert" c="red" size="xs">
                    {t('project-support.copy-failed')}
                </Text>
            )}
        </li>
    )
}

export function SupportPage() {
    const { t } = useTranslation()

    return (
        <Page title={t('project-support.title')}>
            <div className={classes.layout}>
                <PageHeaderShared
                    icon={<TbHeart size={24} />}
                    title={t('project-support.title')}
                    actions={
                        <Button
                            component="a"
                            href="https://t.me/lottman"
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="default"
                            className={classes.contactButton}
                            leftSection={<TbBrandTelegram size={18} />}
                        >
                            {t('project-support.contact')}
                        </Button>
                    }
                />
                <Text className={classes.description}>{t('project-support.description')}</Text>
                <Card
                    component="section"
                    aria-labelledby="support-wallets-heading"
                    className={classes.walletList}
                    withBorder
                    padding={0}
                >
                    <div className={classes.listHeader}>
                        <Title order={3} id="support-wallets-heading" size="h4">
                            {t('project-support.wallets')}
                        </Title>
                        <Text className={classes.networkNote} size="sm">
                            {t('project-support.network-note')}
                        </Text>
                    </div>
                    <ul className={classes.rows}>
                        {SUPPORT_WALLETS.map((wallet) => (
                            <WalletRow wallet={wallet} key={wallet.id} />
                        ))}
                    </ul>
                </Card>
            </div>
        </Page>
    )
}

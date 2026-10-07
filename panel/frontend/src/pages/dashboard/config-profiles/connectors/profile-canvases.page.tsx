import { Card, SimpleGrid, Text } from '@mantine/core'
import { TbSitemap } from 'react-icons/tb'
import { Link } from 'react-router'

import { useGetConfigProfiles } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { useUiText } from '@shared/i18n/interface-text'
import { LoadingScreen } from '@shared/ui'
import { Page } from '@shared/ui/page'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

import classes from './profile-canvases.module.css'

export function ProfileCanvasesPage() {
    const uiText = useUiText()

    const { data, isLoading, isError } = useGetConfigProfiles()

    if (isLoading) return <LoadingScreen />

    return (
        <Page title={uiText('canvases-811c4ef')}>
            <PageHeaderShared icon={<TbSitemap size={24} />} title={uiText('canvases-811c4ef')} />
            {isError && <Text c="red">{uiText('failed-to-load-profiles-b623ebf')}</Text>}
            {!isError && !data?.configProfiles.length && (
                <Text c="dimmed">{uiText('no-profiles-yet-bd4729e')}</Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {data?.configProfiles.map((profile, index) => (
                    <Card
                        className={classes.canvasCard}
                        key={profile.uuid}
                        style={{ animationDelay: `${Math.min(index, 16) * 55}ms` }}
                        component={Link}
                        to={ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_CANVAS.replace(
                            ':uuid',
                            profile.uuid
                        )}
                        withBorder
                    >
                        <Text fw={600}>{profile.name}</Text>
                        <Text c="dimmed" size="xs">
                            {profile.uuid}
                        </Text>
                    </Card>
                ))}
            </SimpleGrid>
        </Page>
    )
}

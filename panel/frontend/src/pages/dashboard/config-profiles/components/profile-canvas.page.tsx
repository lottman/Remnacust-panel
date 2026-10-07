import { Button, Group, Select } from '@mantine/core'
import { GetConfigProfileByUuidCommand, GetSnippetsCommand } from '@remnawave/backend-contract'
import { TbArrowBackUp, TbSitemap } from 'react-icons/tb'
import { useNavigate } from 'react-router'

import { useGetConfigProfiles } from '@shared/api/hooks'
import { ROUTES } from '@shared/constants'
import { useUiText } from '@shared/i18n/interface-text'
import { Page } from '@shared/ui/page'
import { PageHeaderShared } from '@shared/ui/page-header/page-header.shared'

import { ProfileCanvas } from './profile-canvas'

interface Props {
    profile: GetConfigProfileByUuidCommand.Response['response']
    snippets: GetSnippetsCommand.Response['response']['snippets']
}

export function ProfileCanvasPage({ profile, snippets }: Props) {
    const uiText = useUiText()

    const navigate = useNavigate()
    const { data: profiles } = useGetConfigProfiles()
    const editorUrl = ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_BY_UUID.replace(
        ':uuid',
        profile.uuid
    )

    return (
        <Page title={`${profile.name} · ${uiText('canvas-3824a9f')}`}>
            <PageHeaderShared
                actions={
                    <Group>
                        <Select
                            aria-label={uiText('select-profile-d42c243')}
                            data={
                                profiles?.configProfiles.map((item) => ({
                                    label: item.name,
                                    value: item.uuid
                                })) ?? []
                            }
                            onChange={(uuid) => {
                                if (uuid && uuid !== profile.uuid)
                                    navigate(
                                        ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_CANVAS.replace(
                                            ':uuid',
                                            uuid
                                        )
                                    )
                            }}
                            searchable
                            value={profile.uuid}
                            w={220}
                        />
                        <Button
                            leftSection={<TbArrowBackUp size={16} />}
                            onClick={() => navigate(ROUTES.DASHBOARD.MANAGEMENT.PROFILE_CANVASES)}
                            variant="light"
                        >
                            {uiText('all-canvases-51c02d8')}
                        </Button>
                    </Group>
                }
                description={profile.uuid}
                icon={<TbSitemap size={24} />}
                title={profile.name}
            />
            <ProfileCanvas
                key={profile.uuid}
                onOpenEditor={() => navigate(editorUrl)}
                profile={profile}
                snippets={snippets}
            />
        </Page>
    )
}

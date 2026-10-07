import { Card, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PiEmpty } from 'react-icons/pi'

import {
    QueryKeys,
    useDeleteInternalSquad,
    useGetInternalSquads,
    useReorderInternalSquads
} from '@shared/api/hooks'
import { queryClient } from '@shared/api/query-client'
import { filterByTag, TagFilterBar } from '@shared/ui'
import { VirtualizedDndGrid } from '@shared/ui/virtualized-dnd-grid'
import { sToMs } from '@shared/utils/time-utils'

import {
    useSectionActiveTag,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

import { InternalSquadCardWidget } from '../internal-squad-card/internal-squad-card.widget'
import { IProps } from './interfaces'

export function InternalSquadsGridWidget(props: IProps) {
    const { internalSquads } = props

    const activeTag = useSectionActiveTag('internalSquads')
    const { setSectionActiveTag } = useViewPreferencesStoreActions()
    const visibleItems = useMemo(
        () => filterByTag(internalSquads ?? [], activeTag),
        [internalSquads, activeTag]
    )
    const { t } = useTranslation()

    const { mutate: reorderInternalSquads } = useReorderInternalSquads({
        mutationFns: {
            onSuccess: (data) => {
                queryClient.setQueryData(QueryKeys.internalSquads.getInternalSquads.queryKey, data)
            }
        }
    })

    useGetInternalSquads({
        rQueryParams: {
            refetchInterval: sToMs(30)
        }
    })

    const { mutate: deleteInternalSquad } = useDeleteInternalSquad({
        mutationFns: {
            onSuccess: () => {
                queryClient.refetchQueries({
                    queryKey: QueryKeys.internalSquads.getInternalSquads.queryKey
                })
            }
        }
    })

    const handleDeleteInternalSquad = (internalSquadUuid: string) => {
        modals.openConfirmModal({
            title: t('common.action.confirm-action'),
            children: t('common.message.confirm-action-description'),
            labels: {
                confirm: t('common.action.delete'),
                cancel: t('common.action.cancel')
            },
            cancelProps: { variant: 'subtle' },
            confirmProps: { color: 'red', variant: 'soft' },
            centered: true,
            onConfirm: () => {
                deleteInternalSquad({
                    route: {
                        uuid: internalSquadUuid
                    }
                })
            }
        })
    }

    const handleReorder = (reorderedItems: typeof internalSquads) => {
        reorderInternalSquads({
            variables: {
                items: reorderedItems.map((item, index) => ({
                    uuid: item.uuid,
                    viewPosition: index
                }))
            }
        })
    }

    if (!internalSquads || internalSquads.length === 0) {
        return (
            <Card p="xl" withBorder>
                <Stack align="center" gap="md">
                    <PiEmpty size={48} style={{ opacity: 0.5 }} />
                    <div>
                        <Title c="dimmed" order={4} ta="center">
                            {t('internal-squads-grid.widget.no-internal-squads')}
                        </Title>
                        <Text c="dimmed" mt="xs" size="sm" ta="center">
                            {t(
                                'internal-squads-grid.widget.create-your-first-internal-squad-to-get-started'
                            )}
                        </Text>
                    </div>
                </Stack>
            </Card>
        )
    }

    return (
        <VirtualizedDndGrid
            enableDnd={activeTag === null}
            header={
                <TagFilterBar
                    activeTag={activeTag}
                    items={internalSquads}
                    onChange={(tag) => setSectionActiveTag('internalSquads', tag)}
                />
            }
            items={visibleItems}
            onReorder={handleReorder}
            renderDragOverlay={(internalSquad) => (
                <InternalSquadCardWidget
                    handleDeleteInternalSquad={handleDeleteInternalSquad}
                    internalSquad={internalSquad}
                    isDragOverlay
                />
            )}
            renderItem={(internalSquad) => (
                <InternalSquadCardWidget
                    disableReordering={activeTag !== null}
                    handleDeleteInternalSquad={handleDeleteInternalSquad}
                    internalSquad={internalSquad}
                />
            )}
            useWindowScroll={true}
        />
    )
}

import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { move } from '@dnd-kit/helpers'
import {
    DragDropProvider,
    DragEndEvent,
    DragOverEvent,
    DragOverlay,
    DragStartEvent
} from '@dnd-kit/react'
import { Box, Container, Stack } from '@mantine/core'
import { GetHostsCommand } from '@remnawave/backend-contract'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { HostCardWidget } from '@widgets/dashboard/hosts/host-card'
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TbListCheck } from 'react-icons/tb'

import { useGetNodes } from '@shared/api/hooks'
import { useIsMobile } from '@shared/hooks'
import { NO_TAG, TagFilterBar } from '@shared/ui'
import { EmptyPageLayout } from '@shared/ui/layouts/empty-page'

import {
    useHostsActiveTag,
    useHostsCardColumns,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

import { mergeVisibleOrder } from '@shared/utils/merge-visible-order'
import { matchesHostStatus } from '@shared/utils/host-status-filter'

import classes from './hosts-table.module.css'
import { IProps } from './interfaces'

export const HostsTableWidget = memo((props: IProps) => {
    const {
        configProfiles,
        handlers,
        hosts,
        isDraggingRef,
        selectedHosts,
        setSelectedHosts,
        state,
        statusFilter
    } = props
    const [draggedHost, setDraggedHost] = useState<
        GetHostsCommand.Response['response'][number] | null
    >(null)
    const dragSnapshotRef = useRef<null | typeof state>(null)

    const [scrollMargin, setScrollMargin] = useState(0)
    const listRef = useRef<HTMLDivElement | null>(null)
    const isMobile = useIsMobile()
    const preferredColumns = useHostsCardColumns()
    const [listWidth, setListWidth] = useState(0)
    const columns = !isMobile && listWidth >= 960 ? preferredColumns : 1

    const activeTag = useHostsActiveTag()
    const { setHostsActiveTag } = useViewPreferencesStoreActions()

    const { data: nodes } = useGetNodes()

    const visibleState = useMemo(() => {
        return state.filter(host => matchesHostStatus(host, statusFilter) && (
            activeTag === null || (activeTag === NO_TAG ? (host.tags ?? []).length === 0 : (host.tags ?? []).includes(activeTag))
        ))
    }, [state, activeTag, statusFilter])

    useLayoutEffect(() => {
        const list = listRef.current
        if (!list) return
        const update = () => {
            setScrollMargin(list.offsetTop)
            setListWidth(list.clientWidth)
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(list)
        return () => observer.disconnect()
    }, [])

    const virtualizer = useWindowVirtualizer({
        count: Math.ceil(visibleState.length / columns),
        estimateSize: () => (isMobile ? 202 : 96),
        overscan: 7,
        scrollMargin,
        getItemKey: (index) => `${columns}:${visibleState[index * columns]?.uuid ?? index}`
    })

    useLayoutEffect(() => virtualizer.measure(), [columns])

    const nodesByUuid = useMemo(
        () => new Map((nodes ?? []).map((node) => [node.uuid, node] as const)),
        [nodes]
    )

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            isDraggingRef.current = true
            dragSnapshotRef.current = state
            const draggedItem = state.find((item) => item.uuid === event.operation.source?.id)
            setDraggedHost(draggedItem || null)
        },
        [state, isDraggingRef]
    )

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            handlers.setState((prev) => {
                const visible = prev.filter(host => matchesHostStatus(host, statusFilter) && (
                    activeTag === null || (activeTag === NO_TAG ? (host.tags ?? []).length === 0 : (host.tags ?? []).includes(activeTag))
                ))
                const ids = visible.map((host) => host.uuid)
                const newIds = move(ids, event)
                if (newIds === ids) return prev

                const hostsByUuid = new Map(prev.map((host) => [host.uuid, host]))
                return mergeVisibleOrder(prev, newIds.map((uuid) => hostsByUuid.get(uuid)!))
            })
        },
        [handlers, activeTag, statusFilter]
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            isDraggingRef.current = false
            setDraggedHost(null)

            const snapshot = dragSnapshotRef.current
            dragSnapshotRef.current = null

            if (event.canceled) {
                if (snapshot) handlers.setState(snapshot)
                return
            }

            handlers.setState((prev) => [...prev])
        },
        [handlers, isDraggingRef]
    )

    const toggleHostSelection = useCallback(
        (hostId: string) => {
            setSelectedHosts((prev) =>
                prev.includes(hostId) ? prev.filter((id) => id !== hostId) : [...prev, hostId]
            )
        },
        [setSelectedHosts]
    )

    if (!hosts || !configProfiles) {
        return null
    }

    return (
        <Stack gap={0}>
            {hosts.length === 0 && <EmptyPageLayout icon={<TbListCheck size={32} />} />}

            <TagFilterBar activeTag={activeTag} items={hosts} onChange={setHostsActiveTag} />

            {hosts.length > 0 && (
                <DragDropProvider
                    modifiers={columns === 1 ? [RestrictToVerticalAxis] : []}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragStart={handleDragStart}
                >
                    <div ref={listRef}>
                        <div
                            style={{
                                height: `${virtualizer.getTotalSize()}px`,
                                width: '100%',
                                position: 'relative'
                            }}
                        >
                            <Container fluid>
                                <Stack gap={0}>
                                    {virtualizer.getVirtualItems().map((virtualItem) => {
                                        const row = visibleState.slice(
                                            virtualItem.index * columns,
                                            (virtualItem.index + 1) * columns
                                        )
                                        if (!row.length) return null

                                        return (
                                            <Box
                                                data-index={virtualItem.index}
                                                key={virtualItem.key}
                                                ref={virtualizer.measureElement}
                                                style={{
                                                    position: 'absolute',
                                                    marginLeft: isMobile ? '0px' : '16px',
                                                    marginRight: isMobile ? '0px' : '16px',
                                                    top: 0,
                                                    left: 0,
                                                    right: 0,
                                                    transform: `translateY(${
                                                        virtualItem.start -
                                                        virtualizer.options.scrollMargin
                                                    }px)`,
                                                }}
                                            >
                                                <div
                                                    className={classes.cardGrid}
                                                    data-columns={columns}
                                                >
                                                    {row.map((item, offset) => (
                                                        <HostCardWidget
                                                            key={item.uuid}
                                                            disableReordering={false}
                                                            configProfiles={configProfiles}
                                                            index={virtualItem.index * columns + offset}
                                                            isSelected={selectedHosts.includes(item.uuid)}
                                                            item={item}
                                                            nodesByUuid={nodesByUuid}
                                                            onSelect={() => toggleHostSelection(item.uuid)}
                                                        />
                                                    ))}
                                                </div>
                                            </Box>
                                        )
                                    })}
                                </Stack>
                            </Container>
                        </div>
                    </div>

                    <DragOverlay>
                        {draggedHost && (
                            <Container fluid pl={0} pr={0}>
                                <HostCardWidget
                                    configProfiles={configProfiles}
                                    index={0}
                                    isDragOverlay
                                    isSelected={selectedHosts.includes(draggedHost.uuid)}
                                    item={draggedHost}
                                    nodesByUuid={nodesByUuid}
                                    onSelect={() => toggleHostSelection(draggedHost.uuid)}
                                />
                            </Container>
                        )}
                    </DragOverlay>
                </DragDropProvider>
            )}
        </Stack>
    )
})

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
import { useListState } from '@mantine/hooks'
import { GetNodesCommand } from '@remnawave/backend-contract'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { TbCpu } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { queryClient } from '@shared/api'
import { nodesQueryKeys, useGetNodes, useReorderNodes } from '@shared/api/hooks'
import { useIsMobile } from '@shared/hooks'
import { NO_TAG, TagFilterBar } from '@shared/ui'
import { EmptyPageLayout } from '@shared/ui/layouts/empty-page'
import { mergeVisibleOrder } from '@shared/utils/merge-visible-order'
import { sToMs } from '@shared/utils/time-utils'

import {
    useNodesCardColumns,
    useNodesActiveTag,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

import { NodeCardWidget } from '../node-card'
import { NodesSpotlightSearchWidget } from '../nodes-spotlight-search'
import { IProps } from './interfaces'
import styles from './NodesTable.module.css'

export const NodesTableWidget = memo((props: IProps) => {
    const { nodes, nodePlugins, nodeIntegrations } = props

    const activeTag = useNodesActiveTag()
    const { setNodesActiveTag } = useViewPreferencesStoreActions()

    const visibleNodes = useMemo(() => {
        if (!nodes) return []
        if (activeTag === null) return nodes
        if (activeTag === NO_TAG) return nodes.filter((node) => (node.tags ?? []).length === 0)
        return nodes.filter((node) => (node.tags ?? []).includes(activeTag))
    }, [nodes, activeTag])

    const [state, handlers] = useListState(visibleNodes)

    const [isPollingEnabled, setIsPollingEnabled] = useState(true)
    const [draggedNode, setDraggedNode] = useState<
        GetNodesCommand.Response['response'][number] | null
    >(null)
    const [scrollMargin, setScrollMargin] = useState(0)
    const listRef = useRef<HTMLDivElement | null>(null)
    const prevStateRef = useRef(state)
    const isDraggingRef = useRef(false)
    const dragSnapshotRef = useRef<typeof state | null>(null)
    const isMobile = useIsMobile()
    const preferredColumns = useNodesCardColumns()
    const [listWidth, setListWidth] = useState(0)
    const columns = !isMobile && listWidth >= 960 ? preferredColumns : 1

    useGetNodes({
        rQueryParams: {
            enabled: isPollingEnabled,
            refetchInterval: isPollingEnabled ? sToMs(5) : false
        }
    })

    const { mutate: reorderNodes } = useReorderNodes({
        mutationFns: {
            onSuccess: (data) => {
                queryClient.setQueryData(nodesQueryKeys.getAllNodes.queryKey, data)
            },
            onError: () => {
                queryClient.invalidateQueries({ queryKey: nodesQueryKeys.getAllNodes.queryKey })
            }
        }
    })

    const virtualizer = useWindowVirtualizer({
        count: Math.ceil(state.length / columns),
        estimateSize: () => (isMobile ? 190 : 90),
        overscan: Math.ceil(6 / columns),
        scrollMargin,
        getItemKey: (index) => `${columns}:${state[index * columns]?.uuid ?? index}`
    })

    useEffect(() => {
        ;(async () => {
            if (!state || state.length === 0) {
                return
            }

            if (isDraggingRef.current) {
                return
            }

            const fullOrder = mergeVisibleOrder(nodes ?? [], state)
            const updatedNodes = fullOrder.map((node, index) => ({
                uuid: node.uuid,
                viewPosition: index
            }))

            const hasOrderChanged = prevStateRef.current?.some(
                (node, index) => state[index] && node.uuid !== state[index].uuid
            )

            if (hasOrderChanged) {
                reorderNodes({ variables: { nodes: updatedNodes } })
            }

            prevStateRef.current = state
        })()
    }, [state])

    useEffect(() => {
        handlers.setState(visibleNodes)
        prevStateRef.current = visibleNodes
    }, [visibleNodes])

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

    const handleDragStart = useCallback(
        (event: DragStartEvent) => {
            setIsPollingEnabled(false)
            isDraggingRef.current = true
            dragSnapshotRef.current = state
            const draggedItem = state.find((item) => item.uuid === event.operation.source?.id)
            setDraggedNode(draggedItem || null)
        },
        [state]
    )

    const handleDragOver = useCallback(
        (event: DragOverEvent) => {
            handlers.setState((prev) => {
                const ids = prev.map((node) => node.uuid)
                const newIds = move(ids, event)
                if (newIds === ids) return prev

                const nodesByUuid = new Map(prev.map((node) => [node.uuid, node]))
                return newIds.map((uuid) => nodesByUuid.get(uuid)!)
            })
        },
        [handlers]
    )

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            isDraggingRef.current = false
            setIsPollingEnabled(true)
            setDraggedNode(null)

            const snapshot = dragSnapshotRef.current
            dragSnapshotRef.current = null

            if (event.canceled) {
                if (snapshot) {
                    prevStateRef.current = snapshot
                    handlers.setState(snapshot)
                }
                return
            }

            handlers.setState((prev) => [...prev])
        },
        [handlers]
    )

    const nodeNames = useMemo(() => {
        const pluginNameByUuid = new Map(
            (nodePlugins?.nodePlugins ?? []).map((plugin) => [plugin.uuid, plugin.name])
        )
        const integrationNameByUuid = new Map(
            (nodeIntegrations?.nodeIntegrations ?? []).map((integration) => [
                integration.uuid,
                integration.name
            ])
        )

        return { pluginNameByUuid, integrationNameByUuid }
    }, [nodePlugins, nodeIntegrations])

    const handleViewNode = useCallback((nodeUuid: string) => {
        showModal('nodes_editNodeModal', { nodeUuid })
    }, [])

    if (!nodes) {
        return null
    }

    if (nodes.length === 0) {
        return <EmptyPageLayout icon={<TbCpu size={32} />} />
    }

    return (
        <>
            <TagFilterBar activeTag={activeTag} items={nodes} onChange={setNodesActiveTag} />

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
                                    const row = state.slice(
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
                                                }px)`
                                            }}
                                        >
                                            <div className={styles.cardGrid} data-columns={columns}>
                                                {row.map((item, offset) => {
                                                    return (
                                                        <NodeCardWidget
                                                            key={item.uuid}
                                                            disableReordering={false}
                                                            handleViewNode={handleViewNode}
                                                            index={
                                                                virtualItem.index * columns + offset
                                                            }
                                                            isMobile={isMobile}
                                                            node={item}
                                                            integrationNameByUuid={
                                                                nodeNames.integrationNameByUuid
                                                            }
                                                            pluginsName={
                                                                item.activePluginUuid
                                                                    ? nodeNames.pluginNameByUuid.get(
                                                                          item.activePluginUuid
                                                                      )
                                                                    : undefined
                                                            }
                                                        />
                                                    )
                                                })}
                                            </div>
                                        </Box>
                                    )
                                })}
                            </Stack>
                        </Container>
                    </div>
                </div>
                <DragOverlay>
                    {draggedNode && (
                        <Container fluid pl={0} pr={0}>
                            <NodeCardWidget
                                handleViewNode={handleViewNode}
                                index={0}
                                integrationNameByUuid={nodeNames.integrationNameByUuid}
                                isDragOverlay
                                isMobile={isMobile}
                                node={draggedNode}
                                pluginsName={
                                    draggedNode.activePluginUuid
                                        ? nodeNames.pluginNameByUuid.get(
                                              draggedNode.activePluginUuid
                                          )
                                        : undefined
                                }
                            />
                        </Container>
                    )}
                </DragOverlay>
            </DragDropProvider>
            {nodes && nodes.length > 0 && <NodesSpotlightSearchWidget nodes={nodes} />}
        </>
    )
})

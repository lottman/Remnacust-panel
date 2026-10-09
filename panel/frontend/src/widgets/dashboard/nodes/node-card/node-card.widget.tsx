import { OptimisticSortingPlugin } from '@dnd-kit/dom/sortable'
import { useSortable } from '@dnd-kit/react/sortable'
import { Badge, Box, Flex, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import clsx from 'clsx'
import { CSSProperties, memo, useMemo } from 'react'
import ReactCountryFlag from 'react-country-flag'
import { useTranslation } from 'react-i18next'
import {
    PiArrowDownDuotone,
    PiArrowsCounterClockwise,
    PiArrowUpDuotone,
    PiCpuDuotone,
    PiDotsSixVertical,
    PiGlobeSimple,
    PiMemoryDuotone,
    PiUsersDuotone
} from 'react-icons/pi'
import { TbAlertCircle, TbPackage, TbPlugConnected } from 'react-icons/tb'

import { translateUiText as uiText } from '@shared/i18n/interface-text'
import { Logo } from '@shared/ui/logo'
import { XrayLogo } from '@shared/ui/logos'
import { NodeHealthBadge } from '@shared/ui/node-health/node-health'
import { ProviderTags } from '@shared/ui/provider-tags/provider-tags'
import { prettifyBytesUtil, prettySiRealtimeBytesUtil } from '@shared/utils/bytes'
import { nodeNeedsCustomUpgrade } from '@shared/utils/node-policy-status'
import { getNodeResetDaysUtil, getXrayUptimeUtil } from '@shared/utils/time-utils'

import { NodeStatusBadgeWidget } from '../node-status-badge'
import { IProps } from './interfaces'
import classes from './NodeCard.module.css'

const getProgressColor = (percentage: number, fallback: boolean) => {
    if (fallback) return 'cyan.6'
    if (percentage > 95) return 'red.6'
    if (percentage > 80) return 'yellow.6'
    return 'cyan.6'
}

export const NodeCardWidget = memo((props: IProps) => {
    const { t } = useTranslation()
    const {
        handleViewNode,
        node,
        index,
        isDragOverlay = false,
        isMobile,
        disableReordering = false,
        integrationsNames,
        pluginsName
    } = props

    const clipboard = useClipboard({ timeout: 500 })

    const sortable = useSortable({
        id: node.uuid,
        index,
        disabled: isDragOverlay || disableReordering,
        plugins: (defaults) => defaults.filter((plugin) => plugin !== OptimisticSortingPlugin)
    })

    const isDragging = !isDragOverlay && sortable.isDragging
    const { ref, handleRef } = sortable

    const style: CSSProperties = {
        opacity: isDragging ? 0 : 1,
        zIndex: isDragging ? 1000 : 'auto'
    }

    const prettyUsedData = prettifyBytesUtil(node.trafficUsedBytes || 0) || '0 B'
    const maxData = node.isTrafficTrackingActive
        ? prettifyBytesUtil(node.trafficLimitBytes || 0) || '∞'
        : '∞'

    const calcPercentage = () => {
        if (!node.isTrafficTrackingActive) return 0
        if (node.trafficLimitBytes === 0) return 100
        return Math.floor(((node.trafficUsedBytes ?? 0) * 100) / (node.trafficLimitBytes ?? 0))
    }
    const percentage = calcPercentage()
    const fallbackProgress = node.isTrafficTrackingActive && node.trafficLimitBytes === 0

    const isOnline = node.isConnected && node.xrayUptime !== 0 && !node.isDisabled
    const isConfigMissing =
        node.configProfile.activeConfigProfileUuid === null ||
        node.configProfile.activeInbounds.length === 0
    const progressColor = getProgressColor(percentage, fallbackProgress)
    const nodeStatus = node.isDisabled
        ? 'disabled'
        : node.isConnected
          ? nodeNeedsCustomUpgrade(node.lastStatusMessage)
              ? 'upgrade-required'
              : 'connected'
          : node.isConnecting
            ? 'connecting'
            : 'offline'

    const { ramPercentage, ramColor, rxSpeed, txSpeed, loadAvg, cpus } = useMemo(() => {
        if (!node.system)
            return {
                ramPercentage: null,
                ramColor: 'teal',
                rxSpeed: null,
                txSpeed: null,
                loadAvg: null,
                cpus: 1
            }
        const { memoryTotal } = node.system.info
        const cpus = Math.max(1, node.system.info.cpus || 1)
        const { memoryUsed, loadAvg } = node.system.stats

        const ramPercentage = memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : null

        let ramColor = 'teal'
        if (ramPercentage !== null && ramPercentage > 70) ramColor = 'yellow'
        if (ramPercentage !== null && ramPercentage > 90) ramColor = 'red'

        if (!node.system.stats.interface)
            return {
                ramPercentage,
                ramColor,
                rxSpeed: null,
                txSpeed: null,
                loadAvg,
                cpus
            }
        return {
            ramPercentage,
            ramColor,
            rxSpeed: prettySiRealtimeBytesUtil(
                node.system.stats.interface.rxBytesPerSec,
                true,
                true
            ),
            txSpeed: prettySiRealtimeBytesUtil(
                node.system.stats.interface.txBytesPerSec,
                true,
                true
            ),
            loadAvg,
            cpus
        }
    }, [node.system])

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        clipboard.copy(node.address)
        notifications.show({
            message: node.address,
            title: t('common.message.copied'),
            color: 'teal'
        })
    }

    const getLoadColor = (load: number, cpus: number) => {
        const ratio = load / cpus
        if (ratio > 1) return 'red'
        if (ratio > 0.7) return 'yellow'
        return 'dimmed'
    }

    return (
        <Box
            className={clsx(classes.nodeRow, {
                [classes.nodeRowDragging]: isDragging
            })}
            data-drag-overlay={isDragOverlay}
            data-node-status={nodeStatus}
            data-panel-motion="row"
            onClick={() => handleViewNode(node.uuid)}
            ref={isDragOverlay || disableReordering ? undefined : ref}
            style={style}
        >
            {!disableReordering && (
                <Box
                    aria-label={node.name}
                    className={clsx(classes.dragHandle, {
                        [classes.dragHandleActive]: isDragging
                    })}
                    ref={isDragOverlay ? undefined : handleRef}
                >
                    <PiDotsSixVertical size="24px" />
                </Box>
            )}

            {!isMobile && (
                <>
                    <div className={classes.desktopGrid}>
                        <div>
                            <Flex align="center" className={classes.identityRow} gap="xs">
                                {isConfigMissing ? (
                                    <Badge
                                        color="red"
                                        leftSection={<TbAlertCircle size={14} />}
                                        size="lg"
                                        variant="light"
                                    >
                                        {uiText('dangling-1f52ec3')}
                                    </Badge>
                                ) : (
                                    <>
                                        <NodeStatusBadgeWidget node={node} withText={false} />
                                        <Badge
                                            color={node.usersOnline! > 0 ? 'teal' : 'gray'}
                                            leftSection={<PiUsersDuotone size={14} />}
                                            miw="7ch"
                                            size="lg"
                                            variant="outline"
                                        >
                                            {node.usersOnline}
                                        </Badge>
                                    </>
                                )}

                                <Flex align="center" className={classes.nameContainer} gap="xs">
                                    {node.countryCode && node.countryCode !== 'XX' && (
                                        <ReactCountryFlag
                                            countryCode={node.countryCode}
                                            style={{
                                                fontSize: '1.6em',
                                                borderRadius: '2px',
                                                flexShrink: 0
                                            }}
                                        />
                                    )}
                                    <Text
                                        dir="auto"
                                        component="button"
                                        type="button"
                                        className={classes.nodeName}
                                        fw={600}
                                        size="md"
                                    >
                                        {node.name}
                                    </Text>
                                </Flex>
                                {node.provider && (
                                    <div className={classes.inlineProvider}>
                                        <ProviderTags
                                            nodeLayout
                                            providers={[node.provider]}
                                            tags={[]}
                                        />
                                    </div>
                                )}
                            </Flex>
                        </div>

                        <div className={classes.providerContainer}>
                            {!!node.tags?.length && (
                                <ProviderTags nodeLayout providers={[]} tags={node.tags} />
                            )}
                        </div>
                        <div className={classes.addressContainer}>
                            <Flex align="center" className={classes.addressRow} gap="xs">
                                <PiGlobeSimple className={classes.icon} size={14} />
                                <Text
                                    dir="ltr"
                                    c="dimmed"
                                    className={classes.addressText}
                                    onClick={handleCopy}
                                    size="sm"
                                >
                                    {node.address}
                                </Text>
                            </Flex>
                        </div>

                        <div>
                            <Box>
                                <Flex direction="column" gap={4}>
                                    <Flex align="center" justify="space-between">
                                        <Text
                                            dir="ltr"
                                            c="dimmed"
                                            ff="monospace"
                                            fw={600}
                                            size="sm"
                                            truncate
                                        >
                                            {prettyUsedData}
                                        </Text>
                                        <Text c="dimmed" size="xs" truncate dir="ltr">
                                            {maxData}
                                        </Text>
                                    </Flex>
                                    <Progress
                                        color={
                                            node.isTrafficTrackingActive ? progressColor : 'cyan'
                                        }
                                        radius="sm"
                                        size="sm"
                                        value={node.isTrafficTrackingActive ? percentage : 100}
                                    />
                                </Flex>
                            </Box>
                        </div>

                        <div>
                            <Flex align="center" gap="xs" justify="space-between">
                                {node.isTrafficTrackingActive ? (
                                    <Flex align="center" gap={4}>
                                        <PiArrowsCounterClockwise
                                            className={classes.icon}
                                            size={14}
                                        />
                                        <Text c="dimmed" size="sm">
                                            {getNodeResetDaysUtil(node.trafficResetDay ?? 1)}
                                        </Text>
                                    </Flex>
                                ) : (
                                    <Box />
                                )}

                                {isOnline && (
                                    <Flex align="center" gap={4}>
                                        <XrayLogo size={14} />
                                        <Text
                                            c={isOnline ? 'teal' : 'red'}
                                            fw={isOnline ? 600 : 500}
                                            size="sm"
                                            truncate
                                        >
                                            {getXrayUptimeUtil(node.xrayUptime)}
                                        </Text>
                                    </Flex>
                                )}
                            </Flex>
                            <Flex align="center" gap={4} justify="flex-end" mt={4}>
                                <Logo color="var(--mantine-color-dimmed)" size={12} />
                                <Text
                                    className={classes.nodeVersion}
                                    dir="ltr"
                                    c="dimmed"
                                    ff="monospace"
                                    lineClamp={2}
                                    size="xs"
                                    title={node.versions ? node.versions.node : undefined}
                                >
                                    {node.versions ? node.versions.node : '—'}
                                </Text>
                            </Flex>
                        </div>
                        <Flex align="center" className={classes.detailsRow}>
                            <Flex align="center" gap={6} style={{ flex: 1, maxWidth: 200 }}>
                                <PiMemoryDuotone className={classes.icon} size={14} />
                                <Progress
                                    color={ramColor}
                                    radius="sm"
                                    size="xs"
                                    style={{ flex: 1 }}
                                    value={ramPercentage ?? 0}
                                />
                                <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                    {ramPercentage !== null ? `${ramPercentage}%` : '—'}
                                </Text>
                            </Flex>
                            <Tooltip
                                label={
                                    loadAvg ? (
                                        <Stack gap={0}>
                                            <Text fw={600} size="xs">
                                                {t('nodeLoad.title', { cores: cpus })}
                                            </Text>
                                            <Text size="xs">
                                                {t('nodeLoad.oneMinute', {
                                                    value: loadAvg[0].toFixed(2),
                                                    percent: Math.round((loadAvg[0] / cpus) * 100)
                                                })}
                                            </Text>
                                            <Text size="xs">
                                                {t('nodeLoad.fiveMinutes', {
                                                    value: loadAvg[1].toFixed(2),
                                                    percent: Math.round((loadAvg[1] / cpus) * 100)
                                                })}
                                            </Text>
                                            <Text size="xs">
                                                {t('nodeLoad.fifteenMinutes', {
                                                    value: loadAvg[2].toFixed(2),
                                                    percent: Math.round((loadAvg[2] / cpus) * 100)
                                                })}
                                            </Text>
                                            <Text c="dimmed" mt={4} size="xs">
                                                {t('nodeLoad.thresholds')}
                                            </Text>
                                        </Stack>
                                    ) : (
                                        t('nodeLoad.noData')
                                    )
                                }
                                multiline
                                radius="md"
                                w={250}
                            >
                                <Flex align="center" gap={4}>
                                    <PiCpuDuotone className={classes.icon} size={12} />
                                    {loadAvg ? (
                                        <Text dir="ltr" ff="monospace" size="xs">
                                            {loadAvg.map((load, i) => (
                                                <Text
                                                    dir="ltr"
                                                    c={getLoadColor(load, cpus)}
                                                    component="span"
                                                    ff="monospace"
                                                    key={i}
                                                    size="xs"
                                                >
                                                    {i > 0 && ' '}
                                                    {load.toFixed(2)}
                                                </Text>
                                            ))}
                                        </Text>
                                    ) : (
                                        <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                            {'—'}
                                        </Text>
                                    )}
                                </Flex>
                            </Tooltip>
                            <Flex align="center" gap={4}>
                                <PiArrowDownDuotone color="var(--mantine-color-teal-5)" size={12} />
                                <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                    {rxSpeed ?? '—'}
                                </Text>
                            </Flex>
                            <Flex align="center" gap={4}>
                                <PiArrowUpDuotone color="var(--mantine-color-cyan-5)" size={12} />
                                <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                    {txSpeed ?? '—'}
                                </Text>
                            </Flex>
                            <Flex align="center" className={classes.versionsRow} gap="md">
                                {pluginsName && (
                                    <Flex align="center" gap={4} maw={150}>
                                        <TbPackage
                                            color="var(--mantine-color-dimmed)"
                                            size={12}
                                            style={{ flexShrink: 0 }}
                                        />
                                        <Text
                                            dir="ltr"
                                            c="dimmed"
                                            ff="monospace"
                                            size="xs"
                                            truncate="end"
                                        >
                                            {pluginsName}
                                        </Text>
                                    </Flex>
                                )}
                                {integrationsNames.length > 0 && (
                                    <Tooltip
                                        label={integrationsNames.join(', ')}
                                        multiline
                                        radius="md"
                                        w={250}
                                    >
                                        <Flex align="center" gap={4} maw={220}>
                                            <TbPlugConnected
                                                color="var(--mantine-color-pink-5)"
                                                size={12}
                                                style={{ flexShrink: 0 }}
                                            />
                                            <Text
                                                dir="ltr"
                                                c="dimmed"
                                                ff="monospace"
                                                size="xs"
                                                truncate="end"
                                            >
                                                {integrationsNames.join(', ')}
                                            </Text>
                                        </Flex>
                                    </Tooltip>
                                )}
                            </Flex>
                        </Flex>
                    </div>
                </>
            )}

            {isMobile && (
                <Box>
                    <Flex align="center" gap="sm" mb="xs" wrap="wrap">
                        {isConfigMissing && (
                            <Badge
                                color="red"
                                leftSection={<TbAlertCircle size={14} />}
                                size="lg"
                                variant="light"
                            >
                                {uiText('dangling-1f52ec3')}
                            </Badge>
                        )}

                        {!isConfigMissing && <NodeStatusBadgeWidget node={node} withText={false} />}
                        <NodeHealthBadge node={node} />

                        {!isConfigMissing && (
                            <Badge
                                color={node.usersOnline! > 0 ? 'teal' : 'gray'}
                                leftSection={<PiUsersDuotone size={14} />}
                                miw="7ch"
                                size="lg"
                                variant="outline"
                            >
                                {node.usersOnline}
                            </Badge>
                        )}

                        <Flex align="center" gap="xs" style={{ flex: '0 1 auto', minWidth: 0 }}>
                            {node.countryCode && node.countryCode !== 'XX' && (
                                <ReactCountryFlag
                                    countryCode={node.countryCode}
                                    style={{
                                        fontSize: '1.5em',
                                        borderRadius: '2px',
                                        flexShrink: 0
                                    }}
                                />
                            )}
                            <Text
                                dir="auto"
                                component="button"
                                type="button"
                                className={classes.nodeName}
                                fw={600}
                                size="sm"
                            >
                                {node.name}
                            </Text>
                        </Flex>
                        {node.provider && (
                            <div className={classes.inlineProvider}>
                                <ProviderTags nodeLayout providers={[node.provider]} tags={[]} />
                            </div>
                        )}
                    </Flex>

                    {node.tags?.length > 0 && (
                        <Box mb="xs">
                            <ProviderTags providers={[]} tags={node.tags} />
                        </Box>
                    )}

                    <Flex align="center" gap="xs" justify="space-between" mb="xs">
                        <Flex align="center" gap={6} style={{ minWidth: 0 }}>
                            <PiGlobeSimple className={classes.icon} size={12} />
                            <Text
                                dir="ltr"
                                c="dimmed"
                                className={classes.addressText}
                                onClick={handleCopy}
                                size="xs"
                                title={node.address}
                            >
                                {node.address}
                            </Text>
                        </Flex>
                        <Text
                            dir="ltr"
                            c="dimmed"
                            ff="monospace"
                            size="xs"
                            maw="45%"
                            truncate
                            title={node.versions?.node}
                        >
                            {node.versions?.node ?? '—'}
                        </Text>
                    </Flex>

                    <Box mb="xs">
                        <Flex direction="column" gap={2}>
                            <Flex align="center" justify="space-between">
                                <Text
                                    dir="ltr"
                                    c="dimmed"
                                    ff="monospace"
                                    fw={600}
                                    size="sm"
                                    truncate
                                >
                                    {prettyUsedData}
                                </Text>
                                <Text c="dimmed" size="xs" dir="ltr">
                                    {maxData}
                                </Text>
                            </Flex>
                        </Flex>
                    </Box>

                    <Progress
                        color={
                            node.isTrafficTrackingActive && percentage >= 0 ? progressColor : 'teal'
                        }
                        radius="sm"
                        size="xs"
                        value={node.isTrafficTrackingActive && percentage >= 0 ? percentage : 100}
                    />

                    <Flex align="center" justify="space-between" mt="xs">
                        {node.isTrafficTrackingActive ? (
                            <Flex align="center" gap={4}>
                                <PiArrowsCounterClockwise className={classes.icon} size={12} />
                                <Text c="dimmed" size="xs">
                                    {getNodeResetDaysUtil(node.trafficResetDay ?? 1)}
                                </Text>
                            </Flex>
                        ) : (
                            <Box />
                        )}

                        <Flex align="center" gap={4}>
                            <XrayLogo size={12} />
                            <Text
                                c={isOnline ? 'teal' : 'dimmed'}
                                fw={isOnline ? 600 : 500}
                                size="xs"
                            >
                                {isOnline
                                    ? getXrayUptimeUtil(node.xrayUptime)
                                    : t('design-ui.node-offline')}
                            </Text>
                        </Flex>
                    </Flex>

                    <Flex align="center" gap="xs" mt="xs" wrap="wrap">
                        <Flex align="center" gap={6} style={{ flex: 1, maxWidth: 160 }}>
                            <PiMemoryDuotone className={classes.icon} size={12} />
                            <Progress
                                color={ramColor}
                                radius="sm"
                                size="xs"
                                style={{ flex: 1 }}
                                value={ramPercentage ?? 0}
                            />
                            <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                {ramPercentage !== null ? `${ramPercentage}%` : '—'}
                            </Text>
                        </Flex>
                        <Flex align="center" gap={4}>
                            <PiArrowUpDuotone color="var(--mantine-color-cyan-5)" size={10} />
                            <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                {txSpeed ?? '—'}
                            </Text>
                        </Flex>
                        <Flex align="center" gap={4}>
                            <PiArrowDownDuotone color="var(--mantine-color-teal-5)" size={10} />
                            <Text dir="ltr" c="dimmed" ff="monospace" size="xs">
                                {rxSpeed ?? '—'}
                            </Text>
                        </Flex>
                    </Flex>
                </Box>
            )}
        </Box>
    )
})

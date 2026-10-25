import type { GetHostsCommand } from '@remnawave/backend-contract'

import {
    Accordion,
    Alert,
    Button,
    Checkbox,
    MultiSelect,
    NumberInput,
    Select,
    Stack,
    Text
} from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { showModal } from '@shared/_modals/show-modal'
import { useGetNodes } from '@shared/api/hooks'

import { PriorityOrder } from './priority-order'

export function StableEntryPanel({ hosts }: { hosts: GetHostsCommand.Response['response'] }) {
    const { t } = useTranslation()
    const { data: nodes, isLoading, isError, refetch } = useGetNodes()
    const [gatewayUuid, setGatewayUuid] = useState<string | null>(null)
    const [hostUuid, setHostUuid] = useState<string | null>(null)
    const [members, setMembers] = useState<string[]>([])
    const [port, setPort] = useState<string | number>(443)
    const [strategy, setStrategy] = useState<'priority' | 'roundRobin' | 'leastConnections'>(
        'priority'
    )
    const [confirmed, setConfirmed] = useState(false)
    const gateway = nodes?.find((node) => node.uuid === gatewayUuid)
    const host = hosts.find((value) => value.uuid === hostUuid)
    const eligible = (nodes ?? []).filter(
        (node) =>
            node.uuid !== gatewayUuid &&
            !node.isDisabled &&
            node.isConnected &&
            host?.nodes.includes(node.uuid)
    )
    const options = eligible.map((node) => ({ value: node.uuid, label: node.name }))
    const ready =
        gateway &&
        !gateway.isDisabled &&
        host &&
        members.length > 0 &&
        members.every((id) => eligible.some((node) => node.uuid === id)) &&
        typeof port === 'number' &&
        Number.isInteger(port) &&
        port > 0 &&
        port <= 65535 &&
        port !== 22 &&
        port !== gateway.port &&
        port === host.port &&
        confirmed
    return (
        <Accordion variant="contained" my="md">
            <Accordion.Item value="entry">
                <Accordion.Control>{t('operations.entryTitle')}</Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed">
                            {t('operations.entryHelp')}
                        </Text>
                        <Alert color="yellow">{t('operations.entryRequirements')}</Alert>
                        {isError && (
                            <Alert color="red">
                                <Button variant="subtle" onClick={() => void refetch()}>
                                    {t('operations.checkConnection')}
                                </Button>
                                {t('operations.requestError')}
                            </Alert>
                        )}
                        <Select
                            searchable
                            label={t('operations.entryGateway')}
                            disabled={isLoading}
                            value={gatewayUuid}
                            data={(nodes ?? [])
                                .filter((node) => !node.isDisabled)
                                .map((node) => ({
                                    value: node.uuid,
                                    label: `${node.name} · ${node.address}`
                                }))}
                            onChange={(value) => {
                                setGatewayUuid(value)
                                setMembers([])
                                setConfirmed(false)
                            }}
                        />
                        <Select
                            searchable
                            label={t('operations.entryHost')}
                            value={hostUuid}
                            data={hosts
                                .filter((value) => !value.isDisabled && value.nodes.length > 0)
                                .map((value) => ({
                                    value: value.uuid,
                                    label: `${value.remark} · ${value.address}:${value.port}`
                                }))}
                            onChange={(value) => {
                                setHostUuid(value)
                                setMembers([])
                                setConfirmed(false)
                            }}
                        />
                        <NumberInput
                            label={t('operations.entryPort')}
                            value={port}
                            min={1}
                            max={65535}
                            allowDecimal={false}
                            allowNegative={false}
                            onChange={(value) => {
                                setPort(value)
                                setConfirmed(false)
                            }}
                        />
                        <MultiSelect
                            searchable
                            label={t('operations.entryBackends')}
                            value={members}
                            data={options}
                            onChange={(value) => {
                                setMembers(value)
                                setConfirmed(false)
                            }}
                        />
                        <Select
                            label={t('autoselect.strategy')}
                            allowDeselect={false}
                            value={strategy}
                            data={(['priority', 'roundRobin', 'leastConnections'] as const).map(
                                (value) => ({
                                    value,
                                    label: t(`operations.entryStrategy_${value}`)
                                })
                            )}
                            onChange={(value) => {
                                if (
                                    value === 'priority' ||
                                    value === 'roundRobin' ||
                                    value === 'leastConnections'
                                )
                                    setStrategy(value)
                                setConfirmed(false)
                            }}
                        />
                        {strategy === 'priority' && members.length > 1 && (
                            <PriorityOrder
                                values={members}
                                options={options}
                                onChange={(value) => {
                                    setMembers(value)
                                    setConfirmed(false)
                                }}
                            />
                        )}
                        <Checkbox
                            checked={confirmed}
                            onChange={(event) => setConfirmed(event.currentTarget.checked)}
                            label={t('operations.entryConfirm')}
                        />
                        <Button
                            disabled={!ready}
                            onClick={() => {
                                if (!ready || !gateway || !host || typeof port !== 'number') return
                                showModal('nodes_nodeSshTerminal', {
                                    node: gateway,
                                    nodeUpgrade: {
                                        id: crypto.randomUUID(),
                                        directory: '/opt/remnacust/entry',
                                        operation: 'configure-entry',
                                        entry: {
                                            hostUuid: host.uuid,
                                            backendNodeUuids: members,
                                            listenPort: port,
                                            strategy
                                        }
                                    }
                                })
                            }}
                        >
                            {t('operations.entryApply')}
                        </Button>
                        <Text size="xs" c="dimmed">
                            {t('operations.entryIndependent')}
                        </Text>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}

import {
    Alert,
    Button,
    Card,
    Checkbox,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Textarea
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageControls, PlanSummary, TargetPicker } from './legacy-quota-recovery'
import { LegacyAllocation, LegacyTarget } from './legacy-quota-recovery.api'
import {
    NativeDraft,
    NativeDecision,
    NativePlan,
    NativeSource,
    nativeOutcomeUnknown,
    nativeRecoveryProblem,
    useNativePreview,
    useNativeResolve,
    useNativeSource
} from './native-quota-recovery.api'
import classes from './quota-recovery.module.css'
import { ReceiptQuotaAck } from './receipt-quota-ack'

type Choice = {
    action: 'CHARGE' | 'LOSS' | null
    target: LegacyTarget | null
    period: 'CURRENT' | 'LIFETIME' | null
}
type Price = { owner: string; factor: string; scale: string; bytes: string }
const blank: Choice = { action: null, target: null, period: null }

function PriceRows({ prices }: { prices: Price[] }) {
    const [page, setPage] = useState(0)
    return (
        <Stack gap={4}>
            {prices.slice(page * 20, page * 20 + 20).map((price, index) => (
                <Text
                    size="xs"
                    dir="ltr"
                    key={`${price.owner}:${price.factor}:${price.scale}:${index}`}
                >
                    #{price.owner} · {price.bytes} B · {price.factor}/{price.scale}×
                </Text>
            ))}
            {prices.length > 20 && (
                <PageControls page={page} total={Math.ceil(prices.length / 20)} change={setPage} />
            )}
        </Stack>
    )
}
function AccountPlan({ plan }: { plan: NativePlan }) {
    const { t } = useTranslation()
    const [page, setPage] = useState(0)
    const rows = useMemo(
        () => [
            ...plan.applyOutside.map((row) => ({ ...row, action: 'APPLY' as const })),
            ...plan.lostOutside.map((row) => ({ ...row, action: 'LOSS' as const }))
        ],
        [plan]
    )
    return (
        <Stack gap="xs">
            <Text fw={600}>{t('quotaRecovery.native.accountReview')}</Text>
            {(plan.accountChanges ?? []).slice(page * 20, page * 20 + 20).map((row) => (
                <Card key={row.account} withBorder p="xs">
                    <Text size="xs" dir="ltr">
                        {row.account}
                    </Text>
                    <Text size="xs">{t('quotaRecovery.native.accountChange')}</Text>
                    <Text size="xs" dir="ltr">
                        {row.before} → {row.after} B (+{row.charged} B)
                    </Text>
                </Card>
            ))}
            {rows.slice(page * 20, page * 20 + 20).map((row, index) => (
                <Card key={`${row.account}:${index}`} withBorder p="xs">
                    <Text size="xs" dir="ltr">
                        {row.account}
                    </Text>
                    <Text size="sm" c={row.action === 'LOSS' ? 'yellow' : undefined}>
                        {t(
                            row.action === 'LOSS'
                                ? 'quotaRecovery.legacy.loss'
                                : 'quotaRecovery.native.applyAccount'
                        )}
                    </Text>
                    <Text size="xs" dir="ltr">
                        #{row.owner} · {row.bytes} B · {row.factor}/{row.scale}×
                    </Text>
                </Card>
            ))}
            {rows.length > 20 && (
                <PageControls page={page} total={Math.ceil(rows.length / 20)} change={setPage} />
            )}
            {plan.lostOutside.length > 0 && (
                <Alert color="yellow">{t('quotaRecovery.native.accountLoss')}</Alert>
            )}
        </Stack>
    )
}

function DecisionView({
    decision,
    uuid,
    generation,
    multiplier,
    onNextSource
}: {
    decision: NativeDecision
    uuid: string
    generation: string
    multiplier: string
    onNextSource: (request: string) => void
}) {
    const { t, i18n } = useTranslation()
    return (
        <Stack gap="sm" role="status">
            <Alert color="teal">{t('quotaRecovery.native.imported')}</Alert>
            <PlanSummary
                plan={decision.plan.billing}
                events={false}
                pauseMessage={t('quotaRecovery.paused')}
            />
            <AccountPlan plan={decision.plan} />
            <ReceiptQuotaAck
                key={`${uuid}:${generation}:${decision.requestId}`}
                uuid={uuid}
                generation={generation}
                decisionRequest={decision.requestId}
                multiplier={multiplier}
                emptyCore={
                    decision.plan.source.frame?.stats.length === 0
                        ? decision.plan.source.frame.coreProcessId
                        : undefined
                }
                onNextSource={onNextSource}
            />
            <details>
                <summary className={classes.summary}>{t('quotaRecovery.details')}</summary>
                {decision.createdAt && (
                    <Text size="xs">
                        {t('quotaRecovery.historySaved', {
                            time: new Intl.DateTimeFormat(i18n.language, {
                                dateStyle: 'short',
                                timeStyle: 'short'
                            }).format(new Date(decision.createdAt))
                        })}
                    </Text>
                )}
                <Text size="xs">{t('quotaRecovery.historyActor')}</Text>
                <Text size="xs" dir="ltr">
                    {decision.actor}
                </Text>
                <Text size="xs" dir="ltr">
                    {decision.requestId}
                </Text>
                <Text size="xs" dir="ltr">
                    SHA-256: {decision.planDigest}
                </Text>
            </details>
        </Stack>
    )
}

function NativeForm({
    uuid,
    source,
    reload,
    onNextSource
}: {
    uuid: string
    source: NativeSource
    reload: () => void
    onNextSource: (request: string) => void
}) {
    const { t } = useTranslation()
    const [choices, setChoices] = useState<Record<string, Choice>>({})
    const [accounts, setAccounts] = useState<Record<string, 'APPLY' | 'LOSS'>>({})
    const [ownerPage, setOwnerPage] = useState(0)
    const [accountPage, setAccountPage] = useState(0)
    const [bulkPeriod, setBulkPeriod] = useState<Choice['period']>(null)
    const [note, setNote] = useState('')
    const [confirmed, setConfirmed] = useState(false)
    const [requestId, setRequestId] = useState<string>()
    const preview = useNativePreview(uuid)
    const resolve = useNativeResolve(uuid)
    const busy = preview.isPending || resolve.isPending
    const uncertain = resolve.isError && nativeOutcomeUnknown(resolve.error)
    const locked = busy || uncertain
    const invalidate = () => {
        preview.reset()
        resolve.reset()
        setConfirmed(false)
        setRequestId(undefined)
    }
    const allocations = useMemo<LegacyAllocation[]>(
        () =>
            source.alreadyCommitted
                ? []
                : source.owners.flatMap<LegacyAllocation>((row) => {
                      const choice = choices[row.u]
                      if (choice?.action === 'LOSS') return [{ owner: row.u, action: 'LOSS' }]
                      if (choice?.action === 'CHARGE' && choice.target && choice.period)
                          return [
                              {
                                  owner: row.u,
                                  action: 'CHARGE',
                                  subject: choice.target.subject,
                                  period: choice.period
                              }
                          ]
                      return []
                  }),
        [source, choices]
    )
    const accountChoices = source.alreadyCommitted
        ? []
        : source.accounts.flatMap<NativeDraft['accounts'][number]>((row) =>
              accounts[row.account] ? [{ account: row.account, action: accounts[row.account] }] : []
          )
    const ready =
        note.trim().length >= 10 &&
        (source.alreadyCommitted ||
            (allocations.length === source.owners.length &&
                accountChoices.length === source.accounts.length))
    const errorText = (error: unknown) => {
        const problem = nativeRecoveryProblem(error)
        if (problem === 'accountUnproven') return t('quotaRecovery.native.accountUnproven')
        if (problem === 'bankCapacity') return t('quotaRecovery.bank.capacity')
        if (problem === 'bankCorrupt') return t('quotaRecovery.bank.corrupt')
        return t(`quotaRecovery.legacy.${problem === 'failed' ? 'resolveFailed' : problem}`)
    }
    if (resolve.data)
        return (
            <DecisionView
                decision={resolve.data}
                uuid={uuid}
                generation={source.generation}
                multiplier={source.multiplier}
                onNextSource={onNextSource}
            />
        )
    return (
        <Stack gap="sm">
            <Button variant="subtle" disabled={locked} onClick={reload}>
                {t('quotaRecovery.refresh')}
            </Button>
            <Alert color="yellow">{t('quotaRecovery.legacy.ownerWarning')}</Alert>
            <Text size="sm">
                {t('quotaRecovery.native.originalFactor')}{' '}
                <bdi dir="ltr">{source.multiplier} / 1000000000</bdi>
            </Text>
            {source.alreadyCommitted ? (
                <Alert color="blue">{t('quotaRecovery.native.alreadyCommitted')}</Alert>
            ) : (
                <>
                    {source.owners.length > 0 && (
                        <>
                            <Select
                                label={t('quotaRecovery.legacy.bulkPeriod')}
                                value={bulkPeriod}
                                disabled={locked}
                                placeholder={t('quotaRecovery.legacy.choose')}
                                data={[
                                    {
                                        value: 'CURRENT',
                                        label: t('quotaRecovery.legacy.currentPeriod')
                                    },
                                    {
                                        value: 'LIFETIME',
                                        label: t('quotaRecovery.legacy.lifetimeOnly')
                                    }
                                ]}
                                onChange={(value) => setBulkPeriod(value as Choice['period'])}
                            />
                            <Group wrap="wrap">
                                <Button
                                    size="xs"
                                    variant="light"
                                    disabled={locked || !bulkPeriod || !source.candidates?.length}
                                    onClick={() => {
                                        if (!bulkPeriod) return
                                        invalidate()
                                        setChoices((previous) => ({
                                            ...previous,
                                            ...Object.fromEntries(
                                                (source.candidates ?? []).map((row) => [
                                                    row.owner,
                                                    {
                                                        action: 'CHARGE',
                                                        target: {
                                                            subject: row.subject,
                                                            userId: row.owner,
                                                            username: row.username
                                                        },
                                                        period: bulkPeriod
                                                    } satisfies Choice
                                                ])
                                            )
                                        }))
                                    }}
                                >
                                    {t('quotaRecovery.legacy.assignMatches')}
                                </Button>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    disabled={locked}
                                    onClick={() => {
                                        invalidate()
                                        setChoices(
                                            Object.fromEntries(
                                                source.owners.map((row) => [
                                                    row.u,
                                                    {
                                                        action: 'LOSS',
                                                        target: null,
                                                        period: null
                                                    } satisfies Choice
                                                ])
                                            )
                                        )
                                    }}
                                >
                                    {t('quotaRecovery.legacy.markLoss')}
                                </Button>
                            </Group>
                        </>
                    )}
                    <Text size="sm">
                        {t('quotaRecovery.legacy.selected', {
                            value: allocations.length,
                            total: source.owners.length
                        })}
                    </Text>
                    {source.owners.slice(ownerPage * 20, ownerPage * 20 + 20).map((row) => {
                        const choice = choices[row.u] ?? blank
                        const change = (next: Choice) => {
                            invalidate()
                            setChoices((previous) => ({ ...previous, [row.u]: next }))
                        }
                        return (
                            <Card key={row.u} withBorder p="sm">
                                <Stack gap="xs">
                                    <Text fw={600} size="sm">
                                        {t('quotaRecovery.legacy.originalOwner', { id: row.u })}
                                    </Text>
                                    <Text size="xs" dir="ltr">
                                        {row.b} {t('quotaRecovery.legacy.bytes')}
                                    </Text>
                                    <Select
                                        label={t('quotaRecovery.legacy.action')}
                                        placeholder={t('quotaRecovery.legacy.choose')}
                                        value={choice.action}
                                        disabled={locked}
                                        data={[
                                            {
                                                value: 'CHARGE',
                                                label: t('quotaRecovery.legacy.charge')
                                            },
                                            { value: 'LOSS', label: t('quotaRecovery.legacy.loss') }
                                        ]}
                                        onChange={(action) =>
                                            change({
                                                ...choice,
                                                action: action as Choice['action']
                                            })
                                        }
                                    />
                                    {choice.action === 'CHARGE' && (
                                        <>
                                            <TargetPicker
                                                generation={source.generation}
                                                value={choice.target}
                                                disabled={locked}
                                                change={(target) => change({ ...choice, target })}
                                            />
                                            <Select
                                                label={t('quotaRecovery.legacy.period')}
                                                placeholder={t('quotaRecovery.legacy.choose')}
                                                disabled={locked}
                                                value={choice.period}
                                                data={[
                                                    {
                                                        value: 'CURRENT',
                                                        label: t(
                                                            'quotaRecovery.legacy.currentPeriod'
                                                        )
                                                    },
                                                    {
                                                        value: 'LIFETIME',
                                                        label: t(
                                                            'quotaRecovery.legacy.lifetimeOnly'
                                                        )
                                                    }
                                                ]}
                                                onChange={(period) =>
                                                    change({
                                                        ...choice,
                                                        period: period as Choice['period']
                                                    })
                                                }
                                            />
                                        </>
                                    )}
                                </Stack>
                            </Card>
                        )
                    })}
                    {source.owners.length > 20 && (
                        <PageControls
                            page={ownerPage}
                            total={Math.ceil(source.owners.length / 20)}
                            change={setOwnerPage}
                            disabled={locked}
                        />
                    )}
                    {source.accounts.length > 0 && (
                        <>
                            <Text fw={600}>{t('quotaRecovery.native.accounts')}</Text>
                            <Text size="sm" c="dimmed">
                                {t('quotaRecovery.native.accountsHelp')}
                            </Text>
                            <Button
                                variant="subtle"
                                disabled={locked || !source.accounts.some((row) => row.eligible)}
                                onClick={() => {
                                    invalidate()
                                    setAccounts((previous) => ({
                                        ...previous,
                                        ...Object.fromEntries(
                                            source.accounts
                                                .filter((row) => row.eligible)
                                                .map((row) => [row.account, 'APPLY' as const])
                                        )
                                    }))
                                }}
                            >
                                {t('quotaRecovery.native.applyVerified')}
                            </Button>
                            {source.accounts
                                .slice(accountPage * 20, accountPage * 20 + 20)
                                .map((row) => (
                                    <Card key={row.account} withBorder p="sm">
                                        <Stack gap="xs">
                                            <Text size="sm">
                                                {row.label ??
                                                    (row.kind === 'USER'
                                                        ? t('quotaRecovery.native.userAccount')
                                                        : row.kind === 'HOST'
                                                          ? t('quotaRecovery.native.hostAccount')
                                                          : (row.key ??
                                                            t(
                                                                'quotaRecovery.native.unknownAccount'
                                                            )))}
                                            </Text>
                                            <details>
                                                <summary className={classes.summary}>
                                                    {t('quotaRecovery.details')}
                                                </summary>
                                                <Text size="xs" dir="ltr">
                                                    {row.account}
                                                </Text>
                                                <PriceRows prices={row.prices} />
                                            </details>
                                            {!row.eligible && (
                                                <Text size="xs" c="yellow">
                                                    {t('quotaRecovery.native.accountUnproven')}
                                                </Text>
                                            )}
                                            <Select
                                                label={t('quotaRecovery.legacy.action')}
                                                placeholder={t('quotaRecovery.legacy.choose')}
                                                value={accounts[row.account] ?? null}
                                                disabled={locked}
                                                data={[
                                                    {
                                                        value: 'APPLY',
                                                        label: t(
                                                            'quotaRecovery.native.applyAccount'
                                                        ),
                                                        disabled: !row.eligible
                                                    },
                                                    {
                                                        value: 'LOSS',
                                                        label: t('quotaRecovery.legacy.loss')
                                                    }
                                                ]}
                                                onChange={(action) => {
                                                    invalidate()
                                                    setAccounts((previous) => {
                                                        const next = { ...previous }
                                                        if (action)
                                                            next[row.account] = action as
                                                                | 'APPLY'
                                                                | 'LOSS'
                                                        else delete next[row.account]
                                                        return next
                                                    })
                                                }}
                                            />
                                        </Stack>
                                    </Card>
                                ))}
                            {source.accounts.length > 20 && (
                                <PageControls
                                    page={accountPage}
                                    total={Math.ceil(source.accounts.length / 20)}
                                    change={setAccountPage}
                                    disabled={locked}
                                />
                            )}
                        </>
                    )}
                </>
            )}
            <Textarea
                label={t('quotaRecovery.legacy.reason')}
                description={t('quotaRecovery.legacy.reasonHelp')}
                value={note}
                minRows={2}
                autosize
                maxLength={1000}
                disabled={locked}
                onChange={(event) => {
                    invalidate()
                    setNote(event.currentTarget.value)
                }}
            />
            <Button
                variant="light"
                disabled={locked || !ready}
                loading={preview.isPending}
                onClick={() => {
                    resolve.reset()
                    setConfirmed(false)
                    setRequestId(undefined)
                    preview.mutate(
                        {
                            generation: source.generation,
                            sourceRequest: source.sourceRequest,
                            bankRequest: crypto.randomUUID(),
                            allocations,
                            accounts: accountChoices,
                            note: note.trim()
                        },
                        { onSuccess: () => setRequestId(crypto.randomUUID()) }
                    )
                }}
            >
                {t('quotaRecovery.native.prepare')}
            </Button>
            {preview.isError && (
                <Alert color="red" role="alert">
                    {errorText(preview.error)}
                </Alert>
            )}
            {preview.data && (
                <>
                    <PlanSummary
                        plan={preview.data.plan.billing}
                        events={false}
                        pauseMessage={t('quotaRecovery.paused')}
                    />
                    <AccountPlan plan={preview.data.plan} />
                    <Checkbox
                        label={t('quotaRecovery.legacy.confirmReview')}
                        checked={confirmed}
                        disabled={locked}
                        onChange={(event) => setConfirmed(event.currentTarget.checked)}
                    />
                    <Button
                        disabled={busy || !confirmed || !requestId}
                        loading={resolve.isPending}
                        onClick={() => {
                            if (preview.variables && preview.data && requestId)
                                resolve.mutate({
                                    ...preview.variables,
                                    requestId,
                                    planDigest: preview.data.planDigest
                                })
                        }}
                    >
                        {t(
                            resolve.isError
                                ? 'quotaRecovery.legacy.retrySame'
                                : 'quotaRecovery.legacy.resolve'
                        )}
                    </Button>
                </>
            )}
            {uncertain && (
                <Alert color="yellow" role="alert">
                    {t('quotaRecovery.native.outcomeUnknown')}
                </Alert>
            )}
            {resolve.isError && !uncertain && (
                <Alert color="red" role="alert">
                    {errorText(resolve.error)}
                </Alert>
            )}
        </Stack>
    )
}

export function NativeQuotaImport({
    uuid,
    request,
    generation
}: {
    uuid: string
    request: string
    generation: string
}) {
    const { t } = useTranslation()
    const [visited, setVisited] = useState(false)
    const identity = `${uuid}:${generation}:${request}`
    const [navigation, setNavigation] = useState(() => ({ identity, requests: [request] }))
    const requests = navigation.identity === identity ? navigation.requests : [request]
    if (navigation.identity !== identity) setNavigation({ identity, requests: [request] })
    const active = requests[requests.length - 1]
    const source = useNativeSource(uuid, active, generation, visited)
    const onNextSource = (next: string) => {
        const previous = requests.indexOf(next)
        setNavigation({
            identity,
            requests: previous >= 0 ? requests.slice(0, previous + 1) : [...requests, next]
        })
    }
    return (
        <details
            onToggle={(event) => {
                if (event.currentTarget.open) setVisited(true)
            }}
        >
            <summary className={classes.summary}>{t('quotaRecovery.native.title')}</summary>
            {visited && (
                <Stack gap="sm" mt="sm" className={`${classes.findings} ${classes.mobileControls}`}>
                    {requests.length > 1 && (
                        <Button
                            size="xs"
                            variant="subtle"
                            onClick={() =>
                                setNavigation({ identity, requests: requests.slice(0, -1) })
                            }
                        >
                            {t('quotaRecovery.tail.previous')}
                        </Button>
                    )}
                    {source.isPending && <Loader size="xs" />}
                    {source.isError && (
                        <Alert color="red">{t('quotaRecovery.legacy.sourceInvalid')}</Alert>
                    )}
                    {!source.data && (
                        <Group>
                            <Button
                                size="xs"
                                variant="subtle"
                                loading={source.isFetching}
                                onClick={() => void source.refetch()}
                            >
                                {t('quotaRecovery.refresh')}
                            </Button>
                        </Group>
                    )}
                    {source.data &&
                        !source.isError &&
                        !source.isFetching &&
                        (source.data.decision ? (
                            <DecisionView
                                decision={source.data.decision}
                                uuid={uuid}
                                generation={generation}
                                multiplier={source.data.multiplier}
                                onNextSource={onNextSource}
                            />
                        ) : (
                            <NativeForm
                                key={source.dataUpdatedAt}
                                uuid={uuid}
                                source={source.data}
                                reload={() => void source.refetch()}
                                onNextSource={onNextSource}
                            />
                        ))}
                </Stack>
            )}
        </details>
    )
}

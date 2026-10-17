import { z } from 'zod';

import { usageOwner } from '@common/utils/device-identity';
import { multiplyConsumption } from '@common/utils/nano';

import {
    createLegacyRecoveryPlan,
    legacyRecoveryDraft,
    legacyRecoveryDigest,
    LegacyRecoveryError,
    LegacyRecoveryTarget,
} from './legacy-recovery-plan';
import { bankDigest, bankUuid } from './quota-bank-model';
import { parseUnreservedUsageCounter, UNRESERVED_PREFIX } from './unreserved-usage';
import { readPersistedUsageJournal } from './usage-archive';
import { frameDigest } from './usage-receipt';

export const nativeRecoveryDraft = legacyRecoveryDraft.extend({
    sourceRequest: bankUuid,
    bankRequest: bankUuid,
    accounts: z
        .array(z.strictObject({ account: bankUuid, action: z.enum(['APPLY', 'LOSS']) }))
        .max(1500),
});
export const nativeRecoveryApproval = nativeRecoveryDraft.extend({
    requestId: bankUuid,
    planDigest: bankDigest,
});
export type NativeRecoveryDraft = z.infer<typeof nativeRecoveryDraft>;
export type NativeRecoveryApproval = z.infer<typeof nativeRecoveryApproval>;
export type NativeRecoveryTicket = {
    stream: string;
    sequence: string;
    core: string | null;
    requestedAt: string | null;
    multiplier: string | null;
    digest: string | null;
    effects?: unknown;
};
export class NativeRecoveryError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'SOURCE_MISSING'
            | 'SOURCE_INVALID'
            | 'TICKET_CHANGED'
            | 'ACCOUNT_UNPROVEN'
            | 'INVALID_ALLOCATION'
            | 'STALE_PLAN'
            | 'REQUEST_CONFLICT'
            | 'ALREADY_RESOLVED',
    ) {
        super('NATIVE_RECOVERY_' + code);
    }
}
const maximum = 9223372036854775807n;
const decimal = (value: string) => /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= maximum;

export function nativeRecoverySource(node: string, original: Buffer, ticket: NativeRecoveryTicket) {
    const journal = readPersistedUsageJournal(original),
        frame = journal.pending;
    if (!frame) throw new NativeRecoveryError('SOURCE_INVALID');
    const digest = frameDigest(frame);
    if (
        journal.stream !== ticket.stream ||
        frame.sequence !== ticket.sequence ||
        frame.coreProcessId !== ticket.core ||
        !ticket.requestedAt ||
        ticket.multiplier === null ||
        !decimal(ticket.multiplier) ||
        (ticket.digest !== null && ticket.digest !== digest)
    )
        throw new NativeRecoveryError('TICKET_CHANGED');
    const owners = new Map<string, bigint>();
    const outside: {
        account: string;
        owner: string;
        factor: string;
        scale: string;
        bytes: string;
    }[] = [];
    for (const stat of frame.stats) {
        if (stat.name.startsWith(UNRESERVED_PREFIX)) {
            const counter = parseUnreservedUsageCounter(stat.name);
            if (!counter) throw new NativeRecoveryError('SOURCE_INVALID');
            outside.push({
                account: counter.account,
                owner: counter.owner,
                factor: String(counter.factor),
                scale: String(counter.scale),
                bytes: stat.value,
            });
            continue;
        }
        const owner = usageOwner(stat.name.slice(7, stat.name.lastIndexOf('>>>traffic>>>')));
        if (!owner || !decimal(owner) || owner === '0')
            throw new NativeRecoveryError('SOURCE_INVALID');
        const amount = (owners.get(owner) ?? 0n) + BigInt(stat.value);
        if (amount > maximum) throw new NativeRecoveryError('SOURCE_INVALID');
        owners.set(owner, amount);
    }
    const payload = [...owners]
        .sort(([a], [b]) => (BigInt(a) < BigInt(b) ? -1 : 1))
        .map(([u, raw]) => {
            const billed = multiplyConsumption(ticket.multiplier!, raw);
            if (billed > maximum) throw new NativeRecoveryError('SOURCE_INVALID');
            return { u, b: String(billed), n: node };
        });
    if (payload.length > 1500 || new Set(outside.map((row) => row.account)).size > 1500)
        throw new NativeRecoveryError('SOURCE_INVALID');
    return {
        node,
        stream: journal.stream,
        frame,
        digest,
        payload,
        outside,
        ticket,
        alreadyCommitted: ticket.digest !== null,
    };
}

export function nativeRecoveryPlan(
    node: string,
    source: ReturnType<typeof nativeRecoverySource>,
    input: NativeRecoveryDraft,
    targets: LegacyRecoveryTarget[],
    bankDigest: string,
    accountProof: { account: string; baseline: string; nano: string }[],
) {
    const accounts = [...input.accounts].sort((a, b) => a.account.localeCompare(b.account));
    const required = source.alreadyCommitted
        ? []
        : [...new Set(source.outside.map((row) => row.account))].sort();
    if (
        accounts.length !== required.length ||
        accounts.some((row, index) => row.account !== required[index])
    )
        throw new NativeRecoveryError('INVALID_ALLOCATION');
    const billing = createLegacyRecoveryPlan(
        source.digest,
        {
            digest: legacyRecoveryDigest(JSON.stringify(source.payload)),
            payload: source.payload,
            applied: source.alreadyCommitted,
            pendingUsers: source.alreadyCommitted ? [] : null,
            committedAt: source.ticket.requestedAt!,
        },
        input,
        targets,
    );
    const decisions = new Map(accounts.map((row) => [row.account, row.action]));
    const applyOutside = source.alreadyCommitted
        ? []
        : source.outside.filter((row) => decisions.get(row.account) === 'APPLY');
    const increments = new Map<string, bigint>();
    for (const row of applyOutside)
        increments.set(
            row.account,
            (increments.get(row.account) ?? 0n) +
                BigInt(row.bytes) * BigInt(row.factor) * (1000000000n / BigInt(row.scale)),
        );
    const proofs = new Map(accountProof.map((row) => [row.account, row]));
    const ceil = (value: bigint) => (value + 999999999n) / 1000000000n;
    const accountChanges = [...increments]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([account, increment]) => {
            const proof = proofs.get(account);
            if (!proof || !decimal(proof.baseline) || !/^(0|[1-9][0-9]{0,30})$/.test(proof.nano))
                throw new NativeRecoveryError('ACCOUNT_UNPROVEN');
            const before = BigInt(proof.baseline),
                nano = BigInt(proof.nano),
                afterNano = nano + increment;
            const after = before + ceil(afterNano) - ceil(nano);
            if (after > maximum) throw new LegacyRecoveryError('OVERFLOW');
            return {
                account,
                before: proof.baseline,
                after: after.toString(),
                charged: (after - before).toString(),
                beforeNano: proof.nano,
                afterNano: afterNano.toString(),
            };
        });
    const plan = {
        version: 'remnacust-native-recovery-v1' as const,
        node,
        generation: input.generation,
        bankRequest: input.bankRequest,
        bankDigest,
        sourceRequest: input.sourceRequest,
        source,
        accounts,
        accountProof,
        accountChanges,
        billing: billing.plan,
        applyOutside,
        lostOutside: source.alreadyCommitted
            ? []
            : source.outside.filter((row) => decisions.get(row.account) === 'LOSS'),
    };
    const text = JSON.stringify(plan);
    // The bank archives this row through a second JSON encoding.
    if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new NativeRecoveryError('SOURCE_INVALID');
    return { plan, text, digest: legacyRecoveryDigest(text) };
}

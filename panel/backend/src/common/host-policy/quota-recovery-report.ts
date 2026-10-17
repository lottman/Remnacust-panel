import { createHash } from 'node:crypto';
import { z } from 'zod';

import { recoveryFenceStateSchema, type RecoveryFence } from './quota-recovery-fence';

const bytes = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((value) => BigInt(value) <= 9223372036854775807n);
export const recoveryStatusSchema = z.object({
    applied: z.boolean(),
    quotaReservesSupported: z.boolean().optional(),
    quotaWatermarksSupported: z.boolean().optional(),
    quotaSnapshotsSupported: z.boolean().optional(),
    quotaRecoveryFencesSupported: z.boolean().optional(),
    quotaRecoveryReleasesSupported: z.boolean().optional(),
    quotaRecoveryReceiptsSupported: z.boolean().optional(),
    quotaRecoverySamplesSupported: z.boolean().optional(),
    quotaRecoveryQuiescenceSupported: z.boolean().optional(),
    quotaRecoveryPolicyBindingsRequired: z.boolean().optional(),
    quotaRecoveryPolicyBindingsSupported: z.boolean().optional(),
    quotaRecovery: recoveryFenceStateSchema.nullable().optional(),
    quotaInstanceId: z.uuid().nullable().optional(),
    quotaJournalSequence: bytes
        .refine((value) => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))
        .nullable()
        .optional(),
    policyRevision: bytes,
    coreProcessId: z.uuid().nullable().optional(),
});
export const recoveryEntrySchema = z.strictObject({
    id: z.uuid(),
    group: z.string().min(1).max(200),
    owner: bytes.refine((value) => value !== '0'),
    expiresAt: z.int().positive().max(Number.MAX_SAFE_INTEGER),
    ceiling: bytes,
    reserved: bytes,
    closed: z.boolean().optional(),
    prepared: z.boolean().optional(),
    activated: z.boolean().optional(),
    scale: z.union([z.literal(0), z.literal(100), z.literal(1_000_000_000)]).optional(),
});
export const recoveryJournalSchema = z.strictObject({
    instance: z.uuid(),
    sequence: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    policyRevision: bytes,
    entries: z.array(recoveryEntrySchema).max(500),
    missingIds: z.array(z.uuid()).max(500),
    nextAfter: z.uuid().nullable(),
});
export type RecoveryBasis = {
    node: {
        name: string;
        address: string;
        port: number | null;
        proxyUrl: string | null;
        disabled: boolean;
    } | null;
    mode: { instance: string | null } | null;
    revision: string;
    watermarks: { instance: string; sequence: string; revision: string }[];
    grants: {
        id: string;
        instance: string;
        group: string;
        owner: string;
        ceiling: string;
        expiresAt: string;
        closedUsage: string | null;
        activation: string | null;
        registrationRequired: boolean;
        registered: boolean;
        identity: {
            source: 'ISSUED' | 'LEGACY' | null;
            subject: string | null;
            current: string | null;
        };
    }[];
    grantCount: string;
    exposures: string;
    stream: { core: string | null; digest: string | null } | null;
};
export const recoveryDigest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const RECOVERY_ISSUES = [
    'NODE_REMOVED',
    'NODE_DISABLED',
    'NODE_UNAVAILABLE',
    'UNSUPPORTED',
    'POLICY_NOT_APPLIED',
    'INVALID_REPORT',
    'JOURNAL_CHANGED',
    'JOURNAL_BEHIND',
    'JOURNAL_AHEAD',
    'POLICY_CHANGED',
    'CORE_CHANGED',
    'PAGINATION_REQUIRED',
    'UNKNOWN_RESERVES',
    'MISSING_RESERVES',
    'RESERVE_BINDING',
    'ACTIVATION_CHANGED',
    'REGISTRATION_CHANGED',
    'SETTLEMENT_REQUIRED',
    'USAGE_EXPOSURE',
    'PENDING_RECEIPT',
    'STATE_CHANGED',
    'RECOVERY_PAUSE_UNCONFIRMED',
    'RECOVERY_FENCE_UNVERIFIED',
    'OWNER_UNPROVEN',
    'OWNER_CHANGED',
] as const;
export type RecoveryIssue = (typeof RECOVERY_ISSUES)[number];
export type RecoveryReport = {
    acknowledgedReceipt?: {
        stream: string;
        sequence: string;
        digest: string;
        witnessDigest: string;
        acknowledgementRequest: string;
        decisionRequest: string;
    };
    pauseRequested?: boolean;
    recoveryFence?: RecoveryFence | null;
    issues: RecoveryIssue[];
    databaseGrants: string;
    nodeGrants: number | null;
    unknownGrants: number;
    missingGrants: number;
    exposureCount: string;
    instance: string | null;
    sequence: string | null;
    policyRevision: string | null;
    journalDigest: string | null;
};
function recoveryContext(basis: RecoveryBasis, statusValue: unknown) {
    const issues = new Set<RecoveryIssue>();
    const report: RecoveryReport = {
        issues: [],
        databaseGrants: basis.grantCount,
        nodeGrants: null,
        unknownGrants: 0,
        missingGrants: 0,
        exposureCount: basis.exposures,
        instance: null,
        sequence: null,
        policyRevision: null,
        journalDigest: null,
    };
    if (!basis.node) issues.add('NODE_REMOVED');
    else if (basis.node.disabled) issues.add('NODE_DISABLED');
    if (BigInt(basis.exposures) > 0n) issues.add('USAGE_EXPOSURE');
    // expected_core is non-null from durable preparation through ACK; a
    // missing committed digest must never turn an in-flight sample into zero.
    if (basis.stream?.core || basis.stream?.digest) issues.add('PENDING_RECEIPT');
    for (const grant of basis.grants) {
        const issue = recoveryOwnerIssue(grant.identity);
        if (issue) issues.add(issue);
    }
    if (statusValue === null) {
        if (basis.node && !basis.node.disabled) issues.add('NODE_UNAVAILABLE');
        return { issues, report, status: null };
    }
    const parsedStatus = recoveryStatusSchema.safeParse(statusValue);
    if (!parsedStatus.success) {
        issues.add('INVALID_REPORT');
        return { issues, report, status: null };
    }
    const status = parsedStatus.data;
    if (status.quotaRecoveryFencesSupported) {
        report.recoveryFence = status.quotaRecovery?.record ?? null;
        if (!status.quotaRecovery) issues.add('RECOVERY_FENCE_UNVERIFIED');
    }
    if (!status.quotaReservesSupported || !status.quotaWatermarksSupported)
        issues.add('UNSUPPORTED');
    if (!status.applied) issues.add('POLICY_NOT_APPLIED');
    if (status.policyRevision !== basis.revision) issues.add('POLICY_CHANGED');
    if (basis.mode?.instance !== status.quotaInstanceId) issues.add('JOURNAL_CHANGED');
    if (basis.stream?.core && basis.stream.core !== status.coreProcessId)
        issues.add('CORE_CHANGED');
    return { issues, report, status };
}

function observeJournal(
    basis: RecoveryBasis,
    context: ReturnType<typeof recoveryContext>,
    journal: { instance: string; sequence: number; policyRevision: string },
    count: number,
    digest: string,
) {
    const { issues, report, status } = context;
    if (!status) return;
    if (
        journal.instance !== status.quotaInstanceId ||
        journal.policyRevision !== status.policyRevision ||
        status.quotaJournalSequence === null ||
        status.quotaJournalSequence === undefined ||
        BigInt(journal.sequence) < BigInt(status.quotaJournalSequence)
    )
        issues.add('STATE_CHANGED');
    report.instance = journal.instance;
    report.sequence = String(journal.sequence);
    report.policyRevision = journal.policyRevision;
    report.nodeGrants = count;
    report.journalDigest = digest;
    const watermark = basis.watermarks.find((row) => row.instance === journal.instance);
    if (!watermark) issues.add('JOURNAL_CHANGED');
    else if (
        BigInt(journal.sequence) < BigInt(watermark.sequence) ||
        BigInt(journal.policyRevision) < BigInt(watermark.revision)
    )
        issues.add('JOURNAL_BEHIND');
    else if (BigInt(journal.sequence) > BigInt(watermark.sequence)) issues.add('JOURNAL_AHEAD');
}

function compareGrant(
    grant: RecoveryBasis['grants'][number],
    entry: z.infer<typeof recoveryEntrySchema>,
    instance: string,
    issues: Set<RecoveryIssue>,
) {
    const ownerIssue = recoveryOwnerIssue(grant.identity);
    if (ownerIssue) issues.add(ownerIssue);
    if (
        grant.instance !== instance ||
        entry.group !== grant.group ||
        entry.owner !== grant.owner ||
        entry.ceiling !== grant.ceiling ||
        entry.expiresAt !== new Date(grant.expiresAt).getTime() ||
        BigInt(entry.reserved) > BigInt(entry.ceiling) ||
        (entry.scale || 100) !== (grant.group.startsWith('user:') ? 1_000_000_000 : 100)
    )
        issues.add('RESERVE_BINDING');
    if (grant.registrationRequired && (grant.activation !== null) !== !!entry.activated)
        issues.add('ACTIVATION_CHANGED');
    if (grant.registrationRequired && grant.registered !== !!entry.prepared)
        issues.add('REGISTRATION_CHANGED');
    if (
        (grant.closedUsage !== null && (!entry.closed || entry.reserved !== grant.closedUsage)) ||
        (grant.closedUsage === null && entry.closed)
    )
        issues.add('SETTLEMENT_REQUIRED');
}

export function recoveryOwnerIssue(
    identity: RecoveryBasis['grants'][number]['identity'] | null | undefined,
): RecoveryIssue | null {
    if (identity?.source !== 'ISSUED' || !identity.subject) return 'OWNER_UNPROVEN';
    return identity.subject === identity.current ? null : 'OWNER_CHANGED';
}

export function recoveryReport(
    basis: RecoveryBasis,
    statusValue: unknown,
    journalValue: unknown,
): RecoveryReport {
    const context = recoveryContext(basis, statusValue);
    const { report, issues, status } = context;
    const finish = () => ({ ...report, issues: [...issues] });
    if (!status) return finish();
    if (journalValue === null) {
        if (status.applied && status.quotaReservesSupported && status.quotaWatermarksSupported)
            issues.add('NODE_UNAVAILABLE');
        return finish();
    }
    const parsed = recoveryJournalSchema.safeParse(journalValue);
    if (!parsed.success) {
        issues.add('INVALID_REPORT');
        return finish();
    }
    const journal = parsed.data;
    observeJournal(basis, context, journal, journal.entries.length, recoveryDigest(journal));
    if (
        journal.nextAfter !== null ||
        BigInt(basis.grantCount) > 500n ||
        basis.watermarks.length > 500
    ) {
        issues.add('PAGINATION_REQUIRED');
        return finish();
    }
    if (journal.missingIds.length) {
        issues.add('INVALID_REPORT');
        return finish();
    }
    const entries = new Map(journal.entries.map((entry) => [entry.id, entry]));
    if (entries.size !== journal.entries.length) {
        issues.add('INVALID_REPORT');
        return finish();
    }
    const expected = new Set(basis.grants.map((grant) => grant.id));
    for (const grant of basis.grants) {
        const entry = entries.get(grant.id);
        if (!entry) {
            report.missingGrants++;
            issues.add('MISSING_RESERVES');
        } else compareGrant(grant, entry, journal.instance, issues);
    }
    for (const entry of journal.entries)
        if (!expected.has(entry.id)) {
            report.unknownGrants++;
            issues.add('UNKNOWN_RESERVES');
        }
    return finish();
}

// Both sides are ordered by the canonical UUID, so memory is bounded by the
// frozen Node snapshot and one SQL page, irrespective of historical SQL size.
export async function recoverySnapshotReport(
    basis: RecoveryBasis,
    statusValue: unknown,
    snapshot: {
        instance: string;
        sequence: number;
        policyRevision: string;
        coreProcessId: string;
        digest: string;
        recovery?: z.infer<typeof recoveryFenceStateSchema>;
        entries: z.infer<typeof recoveryEntrySchema>[];
    },
    grants: AsyncIterable<RecoveryBasis['grants'][number]>,
): Promise<RecoveryReport> {
    const context = recoveryContext(basis, statusValue);
    const { report, issues, status } = context;
    if (!status) return { ...report, issues: [...issues] };
    observeJournal(basis, context, snapshot, snapshot.entries.length, snapshot.digest);
    if (snapshot.coreProcessId !== status.coreProcessId) issues.add('STATE_CHANGED');
    if (JSON.stringify(snapshot.recovery ?? null) !== JSON.stringify(status.quotaRecovery ?? null))
        issues.add('STATE_CHANGED');
    if (basis.watermarks.length > 500) issues.add('PAGINATION_REQUIRED');
    let index = 0,
        count = 0n,
        previous = '';
    for await (const grant of grants) {
        if (grant.id <= previous) throw new Error('Unordered recovery grants');
        previous = grant.id;
        count++;
        while (index < snapshot.entries.length && snapshot.entries[index].id < grant.id) {
            index++;
            report.unknownGrants++;
            issues.add('UNKNOWN_RESERVES');
        }
        const entry = snapshot.entries[index];
        if (!entry || entry.id !== grant.id) {
            report.missingGrants++;
            issues.add('MISSING_RESERVES');
        } else {
            compareGrant(grant, entry, snapshot.instance, issues);
            index++;
        }
    }
    if (index < snapshot.entries.length) {
        report.unknownGrants += snapshot.entries.length - index;
        issues.add('UNKNOWN_RESERVES');
    }
    if (count !== BigInt(basis.grantCount)) issues.add('STATE_CHANGED');
    return { ...report, issues: [...issues] };
}

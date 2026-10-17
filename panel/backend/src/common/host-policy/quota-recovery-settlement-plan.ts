import type { RecoverySnapshot } from './quota-recovery-snapshot';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { bankUuid, bankDigest } from './quota-bank-model';

export const settlementDraft = z.strictObject({
    generation: bankUuid,
    bankRequest: bankUuid,
    sourceRequest: bankUuid,
    ids: z.array(bankUuid).min(1).max(500),
    note: z.string().trim().min(10).max(1000),
});
export const settlementApproval = settlementDraft.extend({
    requestId: bankUuid,
    planDigest: bankDigest,
});
export type SettlementDraft = z.infer<typeof settlementDraft>;
export type SettlementApproval = z.infer<typeof settlementApproval>;
export type SettlementGrant = {
    id: string;
    node: string;
    instance: string;
    kind: string;
    key: string;
    owner: string;
    ceiling: string;
    expiresAt: string;
    expiresMs: string;
    closedUsage: string | null;
    closedRevision: string | null;
    subject: string | null;
    currentSubject: string | null;
    origin: string | null;
    revision: string | null;
};
export class RecoverySettlementError extends Error {
    constructor(
        readonly code:
            | 'NOT_PENDING'
            | 'SOURCE_MISSING'
            | 'SOURCE_INVALID'
            | 'OWNER_UNPROVEN'
            | 'STALE_PLAN'
            | 'BINDING_CHANGED'
            | 'REQUEST_CONFLICT',
    ) {
        super('RECOVERY_SETTLEMENT_' + code);
    }
}
export const settlementDigest = (text: string) => createHash('sha256').update(text).digest('hex');
const decimal = (value: string) =>
    /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n;
export function createSettlementPlan(
    node: string,
    source: RecoverySnapshot,
    bankDigest: string,
    input: SettlementDraft,
    grants: SettlementGrant[],
) {
    const ids = [...input.ids].sort();
    if (new Set(ids).size !== ids.length || grants.length !== ids.length)
        throw new RecoverySettlementError('BINDING_CHANGED');
    const entries = new Map(source.entries.map((row) => [row.id, row])),
        targets = new Map(grants.map((row) => [row.id, row]));
    if (!decimal(source.policyRevision) || source.policyRevision === '0')
        throw new RecoverySettlementError('SOURCE_INVALID');
    const changes = ids.map((id) => {
        const entry = entries.get(id),
            grant = targets.get(id);
        if (
            !grant ||
            !entry?.closed ||
            !decimal(grant.ceiling) ||
            !decimal(entry.reserved) ||
            !decimal(entry.ceiling)
        )
            throw new RecoverySettlementError('BINDING_CHANGED');
        if (grant.origin !== 'ISSUED' || !grant.subject || grant.subject !== grant.currentSubject)
            throw new RecoverySettlementError('OWNER_UNPROVEN');
        const group =
            grant.kind === 'USER'
                ? 'user:'
                : grant.kind === 'HOST'
                  ? 'host:'
                  : grant.kind === 'TAG'
                    ? 'tag:'
                    : null;
        if (
            !group ||
            grant.node !== node ||
            grant.instance !== source.instance ||
            entry.group !== group + grant.key ||
            entry.owner !== grant.owner ||
            grant.expiresMs !== String(entry.expiresAt) ||
            BigInt(entry.ceiling) > BigInt(grant.ceiling) ||
            BigInt(entry.reserved) > BigInt(entry.ceiling) ||
            (entry.scale || 100) !== (grant.kind === 'USER' ? 1000000000 : 100) ||
            !grant.revision ||
            !decimal(grant.revision) ||
            BigInt(grant.revision) < BigInt(source.policyRevision) ||
            (grant.closedUsage !== null && grant.closedUsage !== entry.reserved)
        )
            throw new RecoverySettlementError('BINDING_CHANGED');
        return {
            grant,
            entry,
            alreadySettled: grant.closedUsage !== null,
            returned:
                grant.closedUsage !== null
                    ? '0'
                    : (BigInt(grant.ceiling) - BigInt(entry.reserved)).toString(),
        };
    });
    const plan = {
        version: 'remnacust-quota-recovery-settlement-v1' as const,
        generation: input.generation,
        bankRequest: input.bankRequest,
        bankDigest,
        node,
        source: {
            requestId: input.sourceRequest,
            generation: source.generation,
            digest: source.digest,
            instance: source.instance,
            sequence: source.sequence,
            policyRevision: source.policyRevision,
            coreProcessId: source.coreProcessId,
        },
        changes,
        note: input.note,
        totalReturned: changes.reduce((sum, row) => sum + BigInt(row.returned), 0n).toString(),
    };
    const text = JSON.stringify(plan);
    if (Buffer.byteLength(text) > 4194304) throw new RecoverySettlementError('SOURCE_INVALID');
    return { plan, text, digest: settlementDigest(text) };
}

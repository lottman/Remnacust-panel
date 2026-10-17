import type { QuotaPolicyBody } from './quota-policy';

import { sql } from 'kysely';
import { z } from 'zod';

import type { TxKyselyService } from '@common/database';

export const QUOTA_REGISTRATION_VERSION = 'remnacust-quota-registrations-v1';
export type RegisteredGrant = {
    id: string;
    instance: string;
    ceiling: string;
    expiresAt: number;
    registrationRequired?: boolean;
};
export type QuotaRegistration = {
    grant: RegisteredGrant;
    group: string;
    owner: string;
    scale?: number;
    action: 'prepare' | 'cancel';
    allowMissing?: boolean;
};

// Runs under the same mode lock and transaction as the desired policy. Credit
// cannot appear in an active policy until a separate durable stage ACK commits.
export async function renderQuotaRegistrations(
    db: TxKyselyService,
    node: string,
    body: QuotaPolicyBody,
    revision: string,
    supported: boolean,
) {
    const modes = await sql<{
        enabled: boolean;
    }>`SELECT grant_registration AS enabled FROM xera_quota_node_modes WHERE node_uuid=${node}::uuid`.execute(
        db.kysely,
    );
    const rows = await sql<{
        id: string;
        instance: string;
        owner: string;
        group: string;
        ceiling: string;
        expiresAt: Date;
        registered: boolean;
        activated: boolean;
        retired: boolean;
        userQuota: boolean;
    }>`
        SELECT g.id::text AS id,g.instance_uuid::text AS instance,g.user_id::text AS owner,
        lower(g.kind)||':'||g.key AS "group",g.ceiling_bytes::text AS ceiling,p.expires_at AS "expiresAt",
        g.registered_revision IS NOT NULL AS registered,g.activation_revision IS NOT NULL AS activated,
        g.retired_at IS NOT NULL AS retired,g.kind='USER' AS "userQuota"
        FROM xera_quota_reserves g JOIN xera_quota_reserve_pools p USING(kind,key,user_id,window_start,budget_epoch)
        WHERE g.node_uuid=${node}::uuid AND g.registration_required AND g.closed_usage_bytes IS NULL AND p.expires_at>now()
        ORDER BY g.id`.execute(db.kysely);
    if (!supported && (modes.rows[0]?.enabled || rows.rows.length))
        throw new Error(`Node ${node}: update node and core before registering quota credit`);
    if (!supported) return;
    body.quotaRegistrations = QUOTA_REGISTRATION_VERSION;
    await sql`UPDATE xera_quota_node_modes SET grant_registration=true WHERE node_uuid=${node}::uuid`.execute(
        db.kysely,
    );
    const grants = new Map(rows.rows.map((row) => [row.id, row]));
    const registrations: QuotaRegistration[] = [];
    for (const row of rows.rows) {
        if (!row.retired || registrations.length >= 500) continue;
        registrations.push({
            grant: {
                id: row.id,
                instance: row.instance,
                ceiling: row.ceiling,
                expiresAt: row.expiresAt.getTime(),
                registrationRequired: true,
            },
            group: row.group,
            owner: row.owner,
            scale: row.userQuota ? 1_000_000_000 : 100,
            action: 'cancel',
            allowMissing: !row.activated,
        });
    }
    for (const [key, wire] of Object.entries(body.groups)) {
        const reserves = wire.reserves as Record<string, RegisteredGrant> | undefined;
        for (const [owner, grant] of Object.entries(reserves ?? {})) {
            const row = grants.get(grant.id);
            if (!row) continue; // Legacy grants retain their original semantics.
            if (row.group !== key || row.owner !== owner || row.retired)
                throw new Error('Invalid registered quota policy binding');
            grant.registrationRequired = true;
            if (!row.registered) {
                delete reserves![owner];
                if (registrations.length < 500)
                    registrations.push({
                        grant,
                        group: key,
                        owner,
                        scale: row.userQuota ? 1_000_000_000 : 100,
                        action: 'prepare',
                    });
            } else if (!row.activated) {
                await sql`UPDATE xera_quota_reserves SET activation_revision=${revision}::bigint WHERE id=${row.id}::uuid AND activation_revision IS NULL`.execute(
                    db.kysely,
                );
            }
        }
    }
    body.registrations = registrations;
    for (const item of registrations)
        await sql`UPDATE xera_quota_reserves SET registration_revision=${revision}::bigint,registration_action=${item.action} WHERE id=${item.grant.id}::uuid`.execute(
            db.kysely,
        );
}

const bytes = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,18})$/)
    .refine((v) => BigInt(v) <= 9223372036854775807n);
const stateSchema = z
    .object({
        instance: z.uuid(),
        sequence: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        policyRevision: bytes,
        entries: z
            .array(
                z
                    .object({
                        id: z.uuid(),
                        group: z.string(),
                        owner: z.string(),
                        expiresAt: z.int(),
                        ceiling: bytes,
                        reserved: bytes,
                        closed: z.boolean().optional(),
                        prepared: z.boolean().optional(),
                        activated: z.boolean().optional(),
                        scale: z.number().optional(),
                    })
                    .strict(),
            )
            .max(500),
        missingIds: z.array(z.uuid()).max(500),
        nextAfter: z.null(),
    })
    .strict();

// Pure verification occurs outside SQL. No missing entry can acknowledge a
// preparation or cancellation, regardless of HTTP success or policy status.
export function verifyQuotaRegistrations(
    value: unknown,
    items: QuotaRegistration[],
    revision: string,
    instance: string,
) {
    const report = stateSchema.parse(value);
    if (
        report.instance !== instance ||
        report.policyRevision !== revision ||
        report.missingIds.length ||
        report.entries.length !== items.length
    )
        throw new Error('Incomplete quota registration acknowledgement');
    const expected = new Map(items.map((item) => [item.grant.id, item]));
    for (const entry of report.entries) {
        const item = expected.get(entry.id);
        if (
            !item ||
            entry.group !== item.group ||
            entry.owner !== item.owner ||
            entry.expiresAt !== item.grant.expiresAt ||
            entry.ceiling !== item.grant.ceiling ||
            !entry.prepared ||
            (entry.scale || 100) !== (item.scale || 100) ||
            BigInt(entry.reserved) > BigInt(entry.ceiling) ||
            (item.action === 'prepare' &&
                (entry.closed || entry.activated || entry.reserved !== '0')) ||
            (item.action === 'cancel' && !entry.closed)
        )
            throw new Error('Quota registration binding mismatch');
        expected.delete(entry.id);
    }
    return report;
}

export async function acknowledgeQuotaRegistrations(
    db: TxKyselyService,
    node: string,
    items: QuotaRegistration[],
    report: ReturnType<typeof verifyQuotaRegistrations>,
) {
    for (const item of items) {
        const matched =
            await sql`SELECT 1 FROM xera_quota_reserves WHERE id=${item.grant.id}::uuid AND node_uuid=${node}::uuid
            AND instance_uuid=${report.instance}::uuid AND registration_required AND registration_revision=${report.policyRevision}::bigint
            AND registration_action=${item.action} AND (activation_revision IS NULL OR ${!item.allowMissing}) FOR UPDATE`.execute(
                db.kysely,
            );
        if (!matched.rows.length)
            throw new Error('Quota registration acknowledgement was superseded');
        if (item.action === 'prepare')
            await sql`UPDATE xera_quota_reserves SET registered_revision=${report.policyRevision}::bigint,registered_sequence=${report.sequence}::bigint
                WHERE id=${item.grant.id}::uuid AND registered_revision IS NULL AND activation_revision IS NULL AND retired_at IS NULL`.execute(
                db.kysely,
            );
        else {
            const entry = report.entries.find((entry) => entry.id === item.grant.id)!;
            await sql`SELECT xera_settle_quota_reserve(${item.grant.id}::uuid,${node}::uuid,${report.instance}::uuid,${item.group},${item.owner}::bigint,
                ${entry.ceiling}::bigint,${new Date(entry.expiresAt)}::timestamptz,${entry.reserved}::bigint,${report.policyRevision}::bigint)`.execute(
                db.kysely,
            );
        }
    }
}

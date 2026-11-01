import { createHash } from 'node:crypto';

// Static SQL is shared by the administrator CLI and the update service. No
// credentials or endpoint details are included in the resulting diagnostics.
export const NODE_CONTINUITY_SQL = `SELECT n.uuid,n.address,n.port,n.proxy_url AS "proxyUrl",
 m.phase,m.instance_uuid::text AS instance,m.applied_core::text AS core,
 m.user_quota AS "userQuota",m.desired_revision::text AS "desiredRevision",
 m.applied_revision::text AS "appliedRevision",m.desired_source AS "desiredSource",
 m.applied_source AS "appliedSource",
 EXISTS(SELECT 1 FROM xera_quota_restore_state WHERE reconciled_at IS NULL) AS recovering,
 EXISTS(SELECT 1 FROM xera_quota_transitions t JOIN xera_quota_transition_nodes p ON p.transition_id=t.id
   WHERE p.node_uuid=n.uuid AND (NOT p.release_ready OR p.released_at IS NULL)
     AND t.phase IN ('PREFLIGHT','FENCING','DRAINING','SETTLING','FUNDING','RELEASING','RECOVERY')) AS transitioning
 FROM nodes n LEFT JOIN xera_quota_node_modes m ON m.node_uuid=n.uuid
 WHERE NOT n.is_disabled AND n.active_config_profile_uuid IS NOT NULL
 ORDER BY n.uuid LIMIT 10001`;

export type ContinuityNode = {
    uuid: string;
    address: string;
    port: number | null;
    proxyUrl: string | null;
    phase: string | null;
    instance: string | null;
    core: string | null;
    userQuota: boolean | null;
    desiredRevision: string | null;
    appliedRevision: string | null;
    desiredSource: string | null;
    appliedSource: string | null;
    recovering: boolean;
    transitioning: boolean;
};
export type ContinuityStatus = {
    version?: string;
    supported?: boolean;
    applied?: boolean;
    offlineReserves?: string;
    userQuotaRequired?: boolean;
    quotaInstanceId?: string;
    coreProcessId?: string;
    policyRevision?: string;
    quotaRecoveryFencesSupported?: boolean;
    quotaRecovery?: { version?: string; record?: { state?: string } | null } | null;
};
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fingerprint = (rows: ContinuityNode[]) =>
    createHash('sha256').update(JSON.stringify(rows)).digest('hex');

export async function checkNodeContinuity(
    read: () => Promise<ContinuityNode[]>,
    probe: (node: ContinuityNode) => Promise<ContinuityStatus>,
    options: { timeoutMs?: number; clock?: () => number } = {},
) {
    const clock = options.clock ?? (() => performance.now());
    const deadline = clock() + (options.timeoutMs ?? 20000);
    const assertFresh = () => {
        if (clock() >= deadline) throw new Error('NODE_CONTINUITY_DEADLINE_EXCEEDED');
    };
    const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
        assertFresh();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const value = await Promise.race([
                Promise.resolve().then(operation),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new Error('NODE_CONTINUITY_DEADLINE_EXCEEDED')),
                        deadline - clock(),
                    );
                }),
            ]);
            assertFresh();
            return value;
        } finally {
            if (timer) clearTimeout(timer);
        }
    };
    const nodes = await bounded(read);
    if (nodes.length > 10000) throw new Error('NODE_CONTINUITY_ROSTER_TOO_LARGE');
    const issues: Array<{ node: string; code: string }> = [];
    // Bounded concurrency prevents a large fleet from exhausting sockets.
    for (let offset = 0; offset < nodes.length; offset += 8) {
        await bounded(() =>
            Promise.all(
                nodes.slice(offset, offset + 8).map(async (node) => {
                    if (
                        node.phase !== 'ACTIVE' ||
                        node.userQuota !== true ||
                        node.recovering ||
                        node.transitioning ||
                        !uuidPattern.test(node.instance ?? '') ||
                        !uuidPattern.test(node.core ?? '') ||
                        !/^[1-9][0-9]{0,18}$/.test(node.desiredRevision ?? '') ||
                        node.desiredRevision !== node.appliedRevision ||
                        !node.desiredSource ||
                        node.desiredSource !== node.appliedSource
                    ) {
                        issues.push({ node: node.uuid, code: 'AUTONOMOUS_POLICY_PENDING' });
                        return;
                    }
                    try {
                        const status = await probe(node);
                        if (
                            status.version !== 'xera-host-policy-v2' ||
                            status.supported !== true ||
                            status.applied !== true ||
                            status.offlineReserves !== 'remnacust-quota-reserves-v1' ||
                            status.userQuotaRequired !== true ||
                            status.quotaInstanceId !== node.instance ||
                            status.coreProcessId !== node.core ||
                            status.policyRevision !== node.desiredRevision ||
                            status.quotaRecoveryFencesSupported !== true ||
                            status.quotaRecovery?.version !== 'remnacust-quota-recovery-fence-v1' ||
                            !Object.hasOwn(status.quotaRecovery, 'record') ||
                            (status.quotaRecovery?.record != null &&
                                status.quotaRecovery.record.state !== 'RELEASED')
                        ) {
                            issues.push({ node: node.uuid, code: 'AUTONOMOUS_POLICY_UNCONFIRMED' });
                        }
                    } catch {
                        issues.push({ node: node.uuid, code: 'NODE_UNREACHABLE' });
                    }
                }),
            ),
        );
    }
    // A concurrent disable, renewal, reset or new node invalidates the proof.
    if (fingerprint(nodes) !== fingerprint(await bounded(read)))
        issues.push({ node: '', code: 'NODE_POLICY_CHANGED' });
    issues.sort((a, b) => a.node.localeCompare(b.node) || a.code.localeCompare(b.code));
    return { ready: issues.length === 0, nodeCount: nodes.length, issues };
}

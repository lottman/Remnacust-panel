import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { nodeBindingTrafficKey, parseProfileTraffic } from '@common/axios/profile-traffic.schema';
import { TxKyselyService } from '@common/database';
import { XRayConfig } from '@common/helpers/xray-config/xray-config.validator';
import { RawCacheService } from '@common/raw-cache';

import { NodePortPlanInput, NodePortPlanInputSchema } from './node-port-plans.schema';
import { nodeManagementReservation, portListenerNetworks } from './port-listener-networks';
import { PortPlanDispatchService } from './port-plan-dispatch.service';
import { compileNodeProfileGraphs } from './profile-graph-plan';
import { NodePortBinding, PortPlanError, PreparedPortProfile } from './profile-port-plan';

type RequestBody =
    | Omit<
          Extract<NodePortPlanInput, { enabled: true }>,
          'requestId' | 'expectedRevision' | 'reviewHash'
      >
    | Omit<
          Extract<NodePortPlanInput, { enabled: false }>,
          'requestId' | 'expectedRevision' | 'reviewHash'
      >;
type PlanState = {
    nodeUuid: string;
    name: string;
    disabled: boolean;
    revision: string;
    enabled: boolean;
    status: string;
    appliedRevision: string | null;
    errorCode: string | null;
    lastRequestId: string | null;
    lastRequestHash: string | null;
    address: string;
    managementPort: number | null;
    profileUuid: string | null;
    activeInbounds: string[];
    bindings: NodePortBinding[];
};
export class PortPlanEditError extends Error {
    constructor(
        readonly code:
            | 'NODE_MISSING'
            | 'STALE_REVISION'
            | 'REQUEST_REUSED'
            | 'HISTORY_MISSING'
            | 'STALE_REVIEW',
    ) {
        super(code);
    }
}
const body = (input: NodePortPlanInput): RequestBody =>
    input.enabled
        ? {
              enabled: true,
              bindings: input.bindings
                  .map((b) => ({ ...b }))
                  .sort((a, b) => a.uuid.localeCompare(b.uuid)),
          }
        : {
              enabled: false,
              profileUuid: input.profileUuid,
              activeInbounds: [...new Set(input.activeInbounds)].sort(),
          };
const stateBody = (state: PlanState): RequestBody =>
    state.enabled
        ? {
              enabled: true,
              bindings: state.bindings
                  .map(
                      ({
                          uuid,
                          configProfileUuid,
                          configProfileInboundUuid,
                          listenAddress,
                          port,
                      }) => ({
                          uuid,
                          configProfileUuid,
                          configProfileInboundUuid,
                          listenAddress,
                          port,
                      }),
                  )
                  .sort((a, b) => a.uuid.localeCompare(b.uuid)),
          }
        : {
              enabled: false,
              profileUuid: state.profileUuid!,
              activeInbounds: [...state.activeInbounds].sort(),
          };

const rethrowPortPlanEditError = (error: unknown): never => {
    const failure = error as { code?: string; meta?: { code?: string } } | null;
    if (
        failure?.code === 'P2034' ||
        (failure?.code === 'P2010' && ['40001', '40P01'].includes(failure.meta?.code ?? ''))
    )
        throw new PortPlanEditError('STALE_REVISION');
    throw error;
};

@Injectable()
export class NodePortPlansService {
    private readonly logger = new Logger(NodePortPlansService.name);
    constructor(
        private readonly db: TxKyselyService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
        private readonly dispatcher: PortPlanDispatchService,
        private readonly cache: RawCacheService,
    ) {}

    private async state(nodeUuid: string, lock = false): Promise<PlanState> {
        if (lock) {
            const node =
                await sql`SELECT uuid FROM nodes WHERE uuid=${nodeUuid}::uuid FOR UPDATE`.execute(
                    this.db.kysely,
                );
            if (!node.rows.length) throw new PortPlanEditError('NODE_MISSING');
        }
        const result =
            await sql<PlanState>`SELECT n.uuid AS "nodeUuid",n.name,n.is_disabled AS disabled,n.address,n.port AS "managementPort",
          n.active_config_profile_uuid AS "profileUuid",COALESCE(p.revision,0)::text AS revision,COALESCE(p.enabled,false) AS enabled,
          COALESCE(p.status,'UNMANAGED') AS status,p.applied_revision::text AS "appliedRevision",p.error_code AS "errorCode",
          p.last_request_id AS "lastRequestId",p.last_request_hash AS "lastRequestHash",
          ARRAY(SELECT j.config_profile_inbound_uuid::text FROM config_profile_inbounds_to_nodes j
             JOIN config_profile_inbounds i ON i.uuid=j.config_profile_inbound_uuid WHERE j.node_uuid=n.uuid AND i.profile_uuid=n.active_config_profile_uuid ORDER BY i.uuid) AS "activeInbounds",
          COALESCE((SELECT json_agg(json_build_object('uuid',b.uuid,'configProfileUuid',b.config_profile_uuid,'configProfileInboundUuid',b.config_profile_inbound_uuid,
             'inboundTag',i.tag,'listenAddress',host(b.listen_address),'port',b.port,'networks',b.networks) ORDER BY b.uuid)
             FROM xera_node_port_bindings b JOIN config_profile_inbounds i ON i.uuid=b.config_profile_inbound_uuid WHERE b.node_uuid=n.uuid),'[]'::json) AS bindings
          FROM nodes n LEFT JOIN xera_node_port_plans p ON p.node_uuid=n.uuid WHERE n.uuid=${nodeUuid}::uuid`.execute(
                this.db.kysely,
            );
        if (!result.rows[0]) throw new PortPlanEditError('NODE_MISSING');
        return result.rows[0];
    }

    async get(nodeUuid: string) {
        const s = await this.state(nodeUuid);
        const {
            lastRequestId: _lastRequestId,
            lastRequestHash: _lastRequestHash,
            address: _address,
            managementPort: _managementPort,
            ...view
        } = s;
        const bindingTraffic = await this.cache
            .get<unknown>(nodeBindingTrafficKey(nodeUuid))
            .then(parseProfileTraffic)
            .catch(() => null);
        return { ...view, bindingTraffic };
    }

    private async prepare(input: NodePortPlanInput, state: PlanState) {
        const ids = input.enabled
            ? [...new Set(input.bindings.map((b) => b.configProfileUuid))]
            : [input.profileUuid];
        const rows = await sql<{
            uuid: string;
            config: Record<string, unknown>;
            inbounds: { uuid: string; tag: string }[];
        }>`
          SELECT p.uuid,p.config,COALESCE(json_agg(json_build_object('uuid',i.uuid,'tag',i.tag) ORDER BY i.uuid) FILTER(WHERE i.uuid IS NOT NULL),'[]'::json) AS inbounds
          FROM config_profiles p LEFT JOIN config_profile_inbounds i ON i.profile_uuid=p.uuid WHERE p.uuid=ANY(${ids}::uuid[]) GROUP BY p.uuid ORDER BY p.uuid`.execute(
            this.db.kysely,
        );
        if (rows.rows.length !== ids.length) throw new PortPlanError('PROFILE_MISSING');
        const snippets = await sql<{
            name: string;
            snippet: unknown;
        }>`SELECT name,snippet FROM config_profile_snippets ORDER BY name`.execute(this.db.kysely);
        const profiles: PreparedPortProfile[] = [],
            bindings: NodePortBinding[] = [];
        for (const row of rows.rows) {
            let config: Record<string, unknown>;
            try {
                const prepared = new XRayConfig(structuredClone(row.config));
                prepared.cleanInboundClients(true);
                prepared.processCertificates();
                prepared.replaceSnippets(new Map(snippets.rows.map((s) => [s.name, s.snippet])));
                config = prepared.getConfig() as Record<string, unknown>;
            } catch {
                // Validation and PEM errors may contain profile contents or file
                // paths. Return the same safe, localizable error as the compiler.
                throw new PortPlanError('INVALID_PROFILE');
            }
            profiles.push({ uuid: row.uuid, config });
            if (input.enabled) {
                for (const b of input.bindings.filter((b) => b.configProfileUuid === row.uuid)) {
                    const metadata = row.inbounds.find(
                        (i) => i.uuid === b.configProfileInboundUuid,
                    );
                    const raw = Array.isArray(config.inbounds)
                        ? config.inbounds.find((i) => i.tag === metadata?.tag)
                        : undefined;
                    if (!metadata || !raw) throw new PortPlanError('INBOUND_MISSING', b.uuid);
                    bindings.push({
                        ...b,
                        inboundTag: metadata.tag,
                        networks: portListenerNetworks(raw),
                    });
                }
            } else if (input.activeInbounds.some((id) => !row.inbounds.some((i) => i.uuid === id)))
                throw new PortPlanError('INBOUND_MISSING');
        }
        let config: Record<string, unknown>;
        if (input.enabled) {
            const plan = compileNodeProfileGraphs(
                bindings,
                profiles,
                nodeManagementReservation(state.address, state.managementPort),
            );
            // Only a preview projection; runtime delivery keeps the graphs apart.
            config = {
                inbounds: plan.graphs.flatMap(
                    (graph) => graph.config.inbounds as Record<string, unknown>[],
                ),
                outbounds: plan.graphs.flatMap(
                    (graph) => graph.config.outbounds as Record<string, unknown>[],
                ),
            };
        } else {
            const legacy = new XRayConfig(profiles[0].config);
            const tags = new Set(
                rows.rows[0].inbounds
                    .filter((i) => input.activeInbounds.includes(i.uuid))
                    .map((i) => i.tag),
            );
            legacy.leaveInbounds(tags);
            config = legacy.getConfig() as Record<string, unknown>;
        }
        return { bindings: bindings.sort((a, b) => a.uuid.localeCompare(b.uuid)), config };
    }

    async preview(nodeUuid: string, request: unknown) {
        const input = NodePortPlanInputSchema.parse(request);
        return this.transactions.withTransaction(
            { isolationLevel: 'RepeatableRead', timeout: 30000 },
            async () => {
                const state = await this.state(nodeUuid);
                if (state.revision !== input.expectedRevision)
                    throw new PortPlanEditError('STALE_REVISION');
                const prepared = await this.prepare(input, state);
                // Deliberately omit credentials, certificate contents and outbound
                // settings; the preview describes the change, not subscriber keys.
                return {
                    revision: state.revision,
                    enabled: input.enabled,
                    bindings: prepared.bindings,
                    inbounds: (prepared.config.inbounds as Record<string, unknown>[]).map((i) => ({
                        tag: i.tag,
                        protocol: i.protocol,
                        listen: i.listen,
                        port: i.port,
                    })),
                    outbounds: (prepared.config.outbounds as Record<string, unknown>[]).map(
                        (o) => ({ tag: o.tag, protocol: o.protocol }),
                    ),
                    changed: JSON.stringify(body(input)) !== JSON.stringify(stateBody(state)),
                    reviewHash: createHash('sha256')
                        .update(JSON.stringify({ body: body(input), prepared }))
                        .digest('hex'),
                };
            },
        );
    }

    async save(nodeUuid: string, request: unknown) {
        const input = NodePortPlanInputSchema.parse(request),
            snapshot = body(input),
            hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
        if (this.transactions.isTransactionActive())
            throw new Error('Port-plan save requires its own commit boundary');
        try {
            await this.transactions.withTransaction(
                { isolationLevel: 'Serializable', timeout: 30000 },
                async () => {
                    const current = await this.state(nodeUuid, true);
                    if (input.requestId && current.lastRequestId === input.requestId) {
                        if (current.lastRequestHash !== hash)
                            throw new PortPlanEditError('REQUEST_REUSED');
                        return;
                    }
                    if (current.revision !== input.expectedRevision)
                        throw new PortPlanEditError('STALE_REVISION');
                    const prepared = await this.prepare(input, current);
                    if (
                        input.reviewHash &&
                        input.reviewHash !==
                            createHash('sha256')
                                .update(JSON.stringify({ body: body(input), prepared }))
                                .digest('hex')
                    )
                        throw new PortPlanEditError('STALE_REVIEW');
                    if (
                        current.revision !== '0' &&
                        JSON.stringify(stateBody(current)) === JSON.stringify(snapshot)
                    )
                        return;
                    if (current.enabled || (current.profileUuid && current.activeInbounds.length))
                        await sql`INSERT INTO xera_node_port_plan_revisions(node_uuid,revision,snapshot) VALUES(${nodeUuid}::uuid,${current.revision}::bigint,${JSON.stringify(stateBody(current))}::jsonb)
                    ON CONFLICT(node_uuid,revision) DO NOTHING`.execute(this.db.kysely);
                    await sql`INSERT INTO xera_node_port_plans(node_uuid,enabled) VALUES(${nodeUuid}::uuid,${input.enabled}) ON CONFLICT(node_uuid) DO NOTHING`.execute(
                        this.db.kysely,
                    );
                    await sql`DELETE FROM xera_node_port_bindings WHERE node_uuid=${nodeUuid}::uuid`.execute(
                        this.db.kysely,
                    );
                    await sql`DELETE FROM config_profile_inbounds_to_nodes WHERE node_uuid=${nodeUuid}::uuid`.execute(
                        this.db.kysely,
                    );
                    const primary = input.enabled
                        ? prepared.bindings[0].configProfileUuid
                        : input.profileUuid;
                    const inboundIds = input.enabled
                        ? [...new Set(prepared.bindings.map((b) => b.configProfileInboundUuid))]
                        : [...new Set(input.activeInbounds)];
                    await sql`UPDATE nodes SET active_config_profile_uuid=${primary}::uuid WHERE uuid=${nodeUuid}::uuid`.execute(
                        this.db.kysely,
                    );
                    await sql`INSERT INTO config_profile_inbounds_to_nodes(node_uuid,config_profile_inbound_uuid) SELECT ${nodeUuid}::uuid,unnest(${inboundIds}::uuid[])`.execute(
                        this.db.kysely,
                    );
                    if (input.enabled) {
                        await sql`INSERT INTO xera_node_port_bindings(uuid,node_uuid,config_profile_uuid,config_profile_inbound_uuid,listen_address,port,networks)
                SELECT b.uuid,${nodeUuid}::uuid,b.profile,b.inbound,b.address::inet,b.port,b.networks FROM jsonb_to_recordset(${JSON.stringify(prepared.bindings.map((b) => ({ uuid: b.uuid, profile: b.configProfileUuid, inbound: b.configProfileInboundUuid, address: b.listenAddress, port: b.port, networks: b.networks })))}::jsonb)
                AS b(uuid uuid,profile uuid,inbound uuid,address text,port int,networks text[])`.execute(
                            this.db.kysely,
                        );
                    }
                    await sql`UPDATE xera_node_port_plans SET enabled=${input.enabled},revision=CASE WHEN ${current.revision}='0' THEN revision ELSE revision+1 END,
                status='PENDING',error_code=NULL,last_request_id=${input.requestId ?? null}::uuid,last_request_hash=${hash},apply_after=clock_timestamp(),apply_attempts=0,updated_at=clock_timestamp()
                WHERE node_uuid=${nodeUuid}::uuid`.execute(this.db.kysely);
                    await sql`DELETE FROM xera_node_port_plan_revisions WHERE node_uuid=${nodeUuid}::uuid AND uuid NOT IN(
                SELECT uuid FROM xera_node_port_plan_revisions WHERE node_uuid=${nodeUuid}::uuid ORDER BY created_at DESC,uuid DESC LIMIT 20)`.execute(
                        this.db.kysely,
                    );
                },
            );
        } catch (error) {
            rethrowPortPlanEditError(error);
        }
        let queued = false;
        try {
            queued = (await this.dispatcher.dispatch(nodeUuid)) > 0;
        } catch {
            this.logger.warn(
                `Port plan for ${nodeUuid} is committed; delivery will retry from its durable job`,
            );
        }
        return { ...(await this.get(nodeUuid)), queued };
    }

    async history(nodeUuid: string) {
        await this.state(nodeUuid);
        return (
            await sql<{
                uuid: string;
                revision: string;
                snapshot: RequestBody;
                createdAt: Date;
            }>`SELECT uuid,revision::text,snapshot,created_at FROM xera_node_port_plan_revisions WHERE node_uuid=${nodeUuid}::uuid ORDER BY created_at DESC,uuid DESC LIMIT 20`.execute(
                this.db.kysely,
            )
        ).rows;
    }

    async restore(
        nodeUuid: string,
        historyUuid: string,
        expectedRevision: string,
        requestId?: string,
    ) {
        const found = await sql<{
            snapshot: RequestBody;
        }>`SELECT snapshot FROM xera_node_port_plan_revisions WHERE node_uuid=${nodeUuid}::uuid AND uuid=${historyUuid}::uuid`.execute(
            this.db.kysely,
        );
        if (!found.rows[0]) throw new PortPlanEditError('HISTORY_MISSING');
        return this.save(nodeUuid, { ...found.rows[0].snapshot, expectedRevision, requestId });
    }

    async retry(nodeUuid: string, expectedRevision: string) {
        if (this.transactions.isTransactionActive())
            throw new Error('Port-plan retry requires its own commit boundary');
        try {
            await this.transactions.withTransaction(
                { isolationLevel: 'Serializable', timeout: 30000 },
                async () => {
                    const current = await this.state(nodeUuid, true);
                    if (current.revision !== expectedRevision || current.revision === '0')
                        throw new PortPlanEditError('STALE_REVISION');
                    await sql`UPDATE xera_node_port_plans SET status='PENDING',error_code=NULL,apply_after=clock_timestamp(),apply_attempts=0 WHERE node_uuid=${nodeUuid}::uuid`.execute(
                        this.db.kysely,
                    );
                },
            );
        } catch (error) {
            rethrowPortPlanEditError(error);
        }
        let queued = false;
        try {
            queued = (await this.dispatcher.dispatch(nodeUuid)) > 0;
        } catch {
            this.logger.warn(`Port-plan retry is pending for ${nodeUuid}`);
        }
        return { ...(await this.get(nodeUuid)), queued };
    }
}

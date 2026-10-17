import { sql } from 'kysely';

import { IQueryHandler, Query, QueryBus, QueryHandler } from '@nestjs/cqrs';

import { TxKyselyService } from '@common/database';
import { XRayConfig } from '@common/helpers/xray-config/xray-config.validator';
import { TResult } from '@common/types';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { GetConfigProfileByUuidQuery } from '@modules/config-profiles/queries/get-config-profile-by-uuid';
import {
    GetPreparedConfigWithUsersQuery,
    IGetPreparedConfigWithUsersResponse,
} from '@modules/users/queries/get-prepared-config-with-users/get-prepared-config-with-users.query';

import { nodeManagementReservation, portListenerNetworks } from '../port-listener-networks';
import { compileNodeProfileGraphs, NodeProfileGraphPlan } from '../profile-graph-plan';
import {
    compileNodePortPlan,
    NodePortBinding,
    PortPlanError,
    PortPlanPreparationError,
    PreparedPortProfile,
    validateNodePortBindings,
    validateIndependentNodePortBindings,
} from '../profile-port-plan';

export type PreparedNodePorts = IGetPreparedConfigWithUsersResponse & {
    portPlanRevision: string;
    portPlanEnabled: boolean;
    profileGraphs?: NodeProfileGraphPlan;
};
export class GetPreparedNodePortsQuery extends Query<PreparedNodePorts | null> {
    constructor(public readonly nodeUuid: string, public readonly profileGraphs = false) {
        super();
    }
}

@QueryHandler(GetPreparedNodePortsQuery)
export class GetPreparedNodePortsHandler implements IQueryHandler<GetPreparedNodePortsQuery> {
    constructor(
        private readonly db: TxKyselyService,
        private readonly queries: QueryBus,
    ) {}

    async execute(query: GetPreparedNodePortsQuery): Promise<PreparedNodePorts | null> {
        // A single snapshot binds the revision to exactly these selected ports.
        // Never combine an old header with bindings from a concurrent save.
        const state = (
            await sql<{
                revision: string;
                enabled: boolean;
                legacyProfile: string | null;
                legacyInboundUuids: string[];
                bindings: NodePortBinding[];
                managementPort: number | null;
                address: string;
            }>`
            SELECT p.revision::text AS revision,p.enabled,n.active_config_profile_uuid AS "legacyProfile",
                ARRAY(SELECT i.uuid::text FROM config_profile_inbounds_to_nodes j JOIN config_profile_inbounds i ON i.uuid=j.config_profile_inbound_uuid
                  WHERE j.node_uuid=n.uuid AND i.profile_uuid=n.active_config_profile_uuid ORDER BY i.uuid) AS "legacyInboundUuids",
                n.port AS "managementPort",n.address,COALESCE(json_agg(json_build_object(
                'uuid',b.uuid,'configProfileUuid',b.config_profile_uuid,'configProfileInboundUuid',b.config_profile_inbound_uuid,
                'inboundTag',i.tag,'listenAddress',host(b.listen_address),'port',b.port,'networks',b.networks) ORDER BY b.uuid)
                FILTER(WHERE b.uuid IS NOT NULL),'[]'::json) AS bindings
            FROM xera_node_port_plans p JOIN nodes n ON n.uuid=p.node_uuid
            LEFT JOIN xera_node_port_bindings b ON b.node_uuid=p.node_uuid
            LEFT JOIN config_profile_inbounds i ON i.uuid=b.config_profile_inbound_uuid AND i.profile_uuid=b.config_profile_uuid
            WHERE p.node_uuid=${query.nodeUuid}::uuid GROUP BY p.revision,p.enabled,n.uuid,n.port,n.address,n.active_config_profile_uuid
        `.execute(this.db.kysely)
        ).rows[0];
        if (!state) return null;
        try {
            if (!state.enabled) {
                if (!state.legacyProfile) throw new PortPlanError('PROFILE_MISSING');
                const profile = await this.queries.execute(
                    new GetConfigProfileByUuidQuery(state.legacyProfile),
                );
                if (!profile.isOk) throw new PortPlanError('PROFILE_MISSING');
                const selected = profile.response.inbounds.filter((inbound) =>
                    state.legacyInboundUuids.includes(inbound.uuid),
                );
                if (!selected.length || selected.length !== state.legacyInboundUuids.length)
                    throw new PortPlanError('INBOUND_MISSING');
                const prepared = await this.queries.execute(
                    new GetPreparedConfigWithUsersQuery(state.legacyProfile, selected),
                );
                if (!prepared.isOk) throw new PortPlanError('INVALID_PROFILE');
                return {
                    ...prepared.response,
                    portPlanRevision: state.revision,
                    portPlanEnabled: false,
                };
            }
            const reserved = nodeManagementReservation(state.address, state.managementPort);
            if (state.bindings.length > 512) throw new PortPlanError('PLAN_TOO_LARGE');
            const byProfile = new Map<string, NodePortBinding[]>();
            for (const binding of state.bindings) {
                let slots = byProfile.get(binding.configProfileUuid);
                if (!slots) byProfile.set(binding.configProfileUuid, (slots = []));
                slots.push(binding);
            }
            const prepared: PreparedPortProfile[] = [];
            const hashes: IGetPreparedConfigWithUsersResponse['hashesPayload']['inbounds'] = [];
            const resolved: { uuid: string; selected: ConfigProfileInboundEntity[] }[] = [];
            for (const [uuid, bindings] of [...byProfile].sort(([a], [b]) => a.localeCompare(b))) {
                const profile = await this.queries.execute(new GetConfigProfileByUuidQuery(uuid));
                if (!profile.isOk) throw new PortPlanError('PROFILE_MISSING', bindings[0].uuid);
                const selected = profile.response.inbounds.filter((inbound) =>
                    bindings.some((binding) => binding.configProfileInboundUuid === inbound.uuid),
                );
                if (
                    selected.length !== new Set(bindings.map(binding => binding.configProfileInboundUuid)).size ||
                    bindings.some(
                        (binding) =>
                            !selected.some(
                                (inbound) =>
                                    inbound.uuid === binding.configProfileInboundUuid &&
                                    inbound.profileUuid === uuid &&
                                    inbound.tag === binding.inboundTag,
                            ),
                    )
                )
                    throw new PortPlanError('INBOUND_MISSING', bindings[0].uuid);
                for (const binding of bindings) {
                    const raw = (
                        profile.response.config as { inbounds?: Record<string, unknown>[] }
                    ).inbounds?.find((i) => i.tag === binding.inboundTag);
                    if (!raw) throw new PortPlanError('INBOUND_MISSING', binding.uuid);
                    binding.networks = portListenerNetworks(raw);
                }
                resolved.push({ uuid, selected });
            }
            (query.profileGraphs ? validateIndependentNodePortBindings : validateNodePortBindings)(state.bindings, reserved);
            for (const { uuid, selected } of resolved) {
                // Reuse the real entitlement/HWID/host-identity pipeline for each
                // profile; concatenating raw clients would bypass squad isolation.
                const result: TResult<IGetPreparedConfigWithUsersResponse> =
                    await this.queries.execute(new GetPreparedConfigWithUsersQuery(uuid, selected));
                if (!result.isOk) throw new PortPlanError('INVALID_PROFILE');
                prepared.push({ uuid, config: result.response.config as Record<string, unknown> });
                hashes.push(...result.response.hashesPayload.inbounds);
            }
            if (query.profileGraphs) {
                const profileGraphs = compileNodeProfileGraphs(state.bindings, prepared, reserved);
                const emptyProfiles = prepared.map(profile => {
                    const empty = new XRayConfig(structuredClone(profile.config));
                    empty.cleanInboundClients(true);
                    return { uuid: profile.uuid, config: empty.getConfig() as Record<string, unknown> };
                });
                const emptyPlan = compileNodeProfileGraphs(state.bindings, emptyProfiles, reserved);
                return {
                    // This root is only the node's private control graph. Each
                    // complete application profile is delivered independently.
                    config: {} as IGetPreparedConfigWithUsersResponse['config'],
                    profileGraphs,
                    hashesPayload: { emptyConfig: emptyPlan.hash, inbounds: hashes.sort((a, b) => a.tag.localeCompare(b.tag)) },
                    portPlanRevision: state.revision,
                    portPlanEnabled: true,
                };
            }
            const config = compileNodePortPlan(state.bindings, prepared, reserved);
            const empty = new XRayConfig(structuredClone(config));
            empty.cleanInboundClients(true);
            return {
                config: config as IGetPreparedConfigWithUsersResponse['config'],
                hashesPayload: {
                    emptyConfig: empty.getConfigHash(),
                    inbounds: hashes.sort((a, b) => a.tag.localeCompare(b.tag)),
                },
                portPlanRevision: state.revision,
                portPlanEnabled: true,
            };
        } catch (error) {
            if (error instanceof PortPlanError)
                throw new PortPlanPreparationError(error.code, state.revision, error.binding);
            throw error;
        }
    }
}

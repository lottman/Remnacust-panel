import { createHash } from 'node:crypto';

import { portListenerNetworks } from './port-listener-networks';
import {
    NodePortBinding,
    PortPlanError,
    PreparedPortProfile,
    validateIndependentNodePortBindings,
} from './profile-port-plan';

type Json = Record<string, unknown>;
export type NodeProfileGraph = {
    bindingUuid: string;
    configProfileUuid: string;
    configProfileInboundUuid: string;
    config: Json;
    hash: string;
};
export type NodeProfileGraphPlan = {
    version: 'remnacust-profile-graphs-v1';
    graphs: NodeProfileGraph[];
    hash: string;
};

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const object = (value: unknown): value is Json =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value))
        return (
            '{' +
            Object.keys(value)
                .sort()
                .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
                .join(',') +
            '}'
        );
    return JSON.stringify(value);
};
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

// Call after the existing entitlement, device and host-key preparation pipeline.
// Each binding carries its full graph: no outbound renaming, route rewriting or
// omission of DNS/policy/Lua/observer/reverse features. No delivery capability is
// implied by compilation; the node must explicitly support the graph protocol.
export function compileNodeProfileGraphs(
    bindings: NodePortBinding[],
    profiles: PreparedPortProfile[],
    reserved: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>[] = [],
): NodeProfileGraphPlan {
    validateIndependentNodePortBindings(bindings, reserved);
    if (!bindings.length) throw new PortPlanError('INVALID_BINDING');
    if (!Array.isArray(profiles) || profiles.length > 512)
        throw new PortPlanError('PLAN_TOO_LARGE');
    const available = new Map<string, Json>();
    for (const profile of profiles) {
        if (
            !profile ||
            !uuid.test(profile.uuid) ||
            available.has(profile.uuid) ||
            !object(profile.config)
        )
            throw new PortPlanError('INVALID_PROFILE');
        if (Buffer.byteLength(JSON.stringify(profile.config)) > 4 * 1024 * 1024)
            throw new PortPlanError('PLAN_TOO_LARGE');
        available.set(profile.uuid, profile.config);
    }
    const graphs: NodeProfileGraph[] = [];
    let bytes = 0;
    for (const binding of [...bindings].sort((a, b) => a.uuid.localeCompare(b.uuid))) {
        const source = available.get(binding.configProfileUuid);
        if (!source) throw new PortPlanError('PROFILE_MISSING', binding.uuid);
        // JSON Build currently mutates os.Environ; it cannot be profile-local.
        if (source.env !== undefined && (!object(source.env) || Object.keys(source.env).length))
            throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', binding.uuid);
        if (
            !Array.isArray(source.inbounds) ||
            !Array.isArray(source.outbounds) ||
            !source.outbounds.length
        )
            throw new PortPlanError('INVALID_PROFILE', binding.uuid);
        for (const entries of [source.inbounds, source.outbounds]) {
            const tags = new Set<string>();
            for (const item of entries) {
                if (
                    !object(item) ||
                    typeof item.tag !== 'string' ||
                    !item.tag ||
                    item.tag.length > 200 ||
                    tags.has(item.tag)
                )
                    throw new PortPlanError('INVALID_PROFILE', binding.uuid);
                tags.add(item.tag);
            }
        }
        const selected = source.inbounds.find((item) => item.tag === binding.inboundTag);
        if (!selected) throw new PortPlanError('INBOUND_MISSING', binding.uuid);
        const networks = portListenerNetworks(selected);
        if (
            networks.length !== binding.networks.length ||
            networks.some((network) => !binding.networks.includes(network))
        )
            throw new PortPlanError('INVALID_BINDING', binding.uuid);
        const config = structuredClone(source);
        config.inbounds = [
            { ...structuredClone(selected), listen: binding.listenAddress, port: binding.port },
        ];
        const graph = {
            bindingUuid: binding.uuid,
            configProfileUuid: binding.configProfileUuid,
            configProfileInboundUuid: binding.configProfileInboundUuid,
            config,
        };
        bytes += Buffer.byteLength(JSON.stringify(graph));
        if (bytes > 16 * 1024 * 1024) throw new PortPlanError('PLAN_TOO_LARGE');
        graphs.push({ ...graph, hash: hash(graph) });
    }
    const plan = { version: 'remnacust-profile-graphs-v1' as const, graphs };
    return { ...plan, hash: hash(plan) };
}

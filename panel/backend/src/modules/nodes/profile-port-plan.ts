import { isIP } from 'node:net';

type JsonObject = Record<string, unknown>;
export type PortNetwork = 'tcp' | 'udp';
export type NodePortBinding = {
    uuid: string;
    configProfileUuid: string;
    configProfileInboundUuid: string;
    inboundTag: string;
    listenAddress: string;
    port: number;
    networks: PortNetwork[];
};
export type PreparedPortProfile = { uuid: string; config: JsonObject };
export type PortPlanErrorCode =
    | 'INVALID_BINDING'
    | 'DUPLICATE_BINDING'
    | 'LISTENER_CONFLICT'
    | 'RESERVED_LISTENER'
    | 'PROFILE_MISSING'
    | 'INBOUND_MISSING'
    | 'DUPLICATE_INBOUND'
    | 'INVALID_PROFILE'
    | 'UNKNOWN_REFERENCE'
    | 'INCOMPATIBLE_GLOBAL_SETTINGS'
    | 'PROFILE_FEATURE_NEEDS_ISOLATION'
    | 'PLAN_TOO_LARGE';

export class PortPlanError extends Error {
    constructor(
        readonly code: PortPlanErrorCode,
        readonly binding?: string,
    ) {
        super(code);
    }
}

export class PortPlanPreparationError extends PortPlanError {
    constructor(
        code: PortPlanErrorCode,
        readonly portPlanRevision: string,
        binding?: string,
    ) {
        super(code, binding);
    }
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const profileParts = new Set([
    'inbounds',
    'outbounds',
    'routing',
    'observatory',
    'burstObservatory',
    'remarks',
]);
const object = (value: unknown): value is JsonObject =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => structuredClone(value);
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
const objects = (value: unknown, required = false): JsonObject[] => {
    if (value === undefined && !required) return [];
    if (!Array.isArray(value) || value.some((item) => !object(item)))
        throw new PortPlanError('INVALID_PROFILE');
    return value as JsonObject[];
};
const strings = (value: unknown): string[] => {
    if (typeof value === 'string') value = value.split(',');
    if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== 'string' || item.length > 200)
    )
        throw new PortPlanError('INVALID_PROFILE');
    return value as string[];
};

function address(raw: string) {
    if (typeof raw !== 'string' || !isIP(raw) || raw.includes('%'))
        throw new PortPlanError('INVALID_BINDING');
    if (isIP(raw) === 4) return { value: raw, family: 4 };
    const value = new URL('http://[' + raw + ']/').hostname.slice(1, -1);
    // IPv4-mapped IPv6 and IPv4 own the same listener space on a dual-stack
    // socket. Canonical spelling also detects expanded/compressed IPv6 aliases.
    if (value.startsWith('::ffff:')) {
        const tail = value.slice(7).split(':');
        if (tail.length === 2) {
            const high = parseInt(tail[0], 16),
                low = parseInt(tail[1], 16);
            return { value: [high >> 8, high & 255, low >> 8, low & 255].join('.'), family: 4 };
        }
    }
    return { value, family: 6 };
}

export function listenersOverlap(
    a: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>,
    b: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>,
): boolean {
    if (a.port !== b.port || !a.networks.some((network) => b.networks.includes(network)))
        return false;
    const left = address(a.listenAddress),
        right = address(b.listenAddress);
    // An unspecified IPv6 listener is treated as dual-stack unless the native
    // receiver proves otherwise; accepting a collision is worse than a refusal.
    if (left.value === '::' || right.value === '::') return true;
    if (left.family !== right.family) return false;
    return left.value === right.value || left.value === '0.0.0.0' || right.value === '0.0.0.0';
}

export function validateNodePortBindings(
    bindings: NodePortBinding[],
    reserved: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>[] = [],
): void {
    validateBindings(bindings, reserved, false);
}

// Independent graphs own tag and inbound identities; only socket ownership and
// the stable binding UUID are node-wide. Legacy combined graphs remain strict.
export function validateIndependentNodePortBindings(
    bindings: NodePortBinding[],
    reserved: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>[] = [],
): void {
    validateBindings(bindings, reserved, true);
}

function validateBindings(
    bindings: NodePortBinding[],
    reserved: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>[],
    independent: boolean,
): void {
    if (!Array.isArray(bindings) || bindings.length > 512)
        throw new PortPlanError('PLAN_TOO_LARGE');
    const ids = new Set<string>(),
        inbounds = new Set<string>(),
        tags = new Set<string>();
    for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i];
        if (
            !binding ||
            !uuid.test(binding.uuid) ||
            !uuid.test(binding.configProfileUuid) ||
            !uuid.test(binding.configProfileInboundUuid) ||
            typeof binding.inboundTag !== 'string' ||
            !binding.inboundTag ||
            binding.inboundTag.length > 200 ||
            !Number.isInteger(binding.port) ||
            binding.port < 1 ||
            binding.port > 65535 ||
            !Array.isArray(binding.networks) ||
            !binding.networks.length ||
            binding.networks.length > 2 ||
            new Set(binding.networks).size !== binding.networks.length ||
            binding.networks.some((network) => network !== 'tcp' && network !== 'udp')
        )
            throw new PortPlanError('INVALID_BINDING', binding?.uuid);
        address(binding.listenAddress);
        if (ids.has(binding.uuid)) throw new PortPlanError('DUPLICATE_BINDING', binding.uuid);
        // Existing identity policies refer to the original inbound tag. Do not
        // silently rename it or expose one identity on two unrelated handlers.
        if (
            !independent &&
            (inbounds.has(binding.configProfileInboundUuid) || tags.has(binding.inboundTag))
        )
            throw new PortPlanError('DUPLICATE_INBOUND', binding.uuid);
        ids.add(binding.uuid);
        inbounds.add(binding.configProfileInboundUuid);
        tags.add(binding.inboundTag);
        if (reserved.some((listener) => listenersOverlap(binding, listener)))
            throw new PortPlanError('RESERVED_LISTENER', binding.uuid);
        if (bindings.slice(0, i).some((other) => listenersOverlap(binding, other)))
            throw new PortPlanError('LISTENER_CONFLICT', binding.uuid);
    }
}

function tagged(items: JsonObject[]) {
    const tags = new Set<string>();
    for (const item of items) {
        if (
            typeof item.tag !== 'string' ||
            !item.tag ||
            item.tag.length > 200 ||
            tags.has(item.tag)
        )
            throw new PortPlanError('INVALID_PROFILE');
        tags.add(item.tag);
    }
    return tags;
}

// Input profiles have already passed snippet/certificate/user preparation. Only
// selected native inbounds are exposed. Namespace every outbound/balancer and
// scope every route, including the implicit first-outbound fallback.
export function compileNodePortPlan(
    bindings: NodePortBinding[],
    profiles: PreparedPortProfile[],
    reserved: Pick<NodePortBinding, 'listenAddress' | 'port' | 'networks'>[] = [],
): JsonObject {
    validateNodePortBindings(bindings, reserved);
    if (!bindings.length) throw new PortPlanError('INVALID_BINDING');
    if (profiles.length > 512) throw new PortPlanError('PLAN_TOO_LARGE');
    const available = new Map<string, JsonObject>();
    for (const profile of profiles) {
        if (!uuid.test(profile.uuid) || available.has(profile.uuid) || !object(profile.config))
            throw new PortPlanError('INVALID_PROFILE');
        if (Buffer.byteLength(JSON.stringify(profile.config)) > 4 * 1024 * 1024)
            throw new PortPlanError('PLAN_TOO_LARGE');
        available.set(profile.uuid, profile.config);
    }
    const selected = new Map<string, NodePortBinding[]>();
    for (const binding of bindings) {
        let list = selected.get(binding.configProfileUuid);
        if (!list) selected.set(binding.configProfileUuid, (list = []));
        list.push(binding);
    }
    let common: JsonObject | undefined, routingOptions: JsonObject | undefined;
    const inbounds: JsonObject[] = [],
        outbounds: JsonObject[] = [],
        rules: JsonObject[] = [],
        balancers: JsonObject[] = [];
    const observations = new Map<string, JsonObject>();
    for (const [id, slots] of [...selected].sort(([a], [b]) => a.localeCompare(b))) {
        const profile = available.get(id);
        if (!profile) throw new PortPlanError('PROFILE_MISSING', slots[0].uuid);
        const shared = Object.fromEntries(
            Object.entries(profile).filter(([key]) => !profileParts.has(key)),
        );
        if (
            ['api', 'metrics', 'reverse'].some((key) => shared[key] !== undefined) ||
            (object(shared.dns) && typeof shared.dns.tag === 'string' && shared.dns.tag)
        )
            throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', slots[0].uuid);
        if (common && canonical(common) !== canonical(shared))
            throw new PortPlanError('INCOMPATIBLE_GLOBAL_SETTINGS', slots[0].uuid);
        common ??= clone(shared);
        const nativeInbounds = objects(profile.inbounds, true),
            nativeOutbounds = objects(profile.outbounds, true);
        tagged(nativeInbounds);
        const outboundTags = tagged(nativeOutbounds);
        if (!nativeOutbounds.length) throw new PortPlanError('INVALID_PROFILE', slots[0].uuid);
        const prefix = 'port-profile:' + id + ':';
        const outbound = (tag: unknown) => {
            if (typeof tag !== 'string' || !outboundTags.has(tag))
                throw new PortPlanError('UNKNOWN_REFERENCE', slots[0].uuid);
            return prefix + 'o:' + tag;
        };
        const allowed = new Set(slots.map((slot) => slot.inboundTag));
        for (const slot of [...slots].sort((a, b) => a.uuid.localeCompare(b.uuid))) {
            const input = nativeInbounds.find((inbound) => inbound.tag === slot.inboundTag);
            if (!input) throw new PortPlanError('INBOUND_MISSING', slot.uuid);
            if (
                input.protocol === 'tun' ||
                (input.listen !== undefined &&
                    (typeof input.listen !== 'string' || !isIP(input.listen))) ||
                (object(input.settings) && input.settings.followRedirect === true) ||
                (object(input.streamSettings) &&
                    object(input.streamSettings.sockopt) &&
                    input.streamSettings.sockopt.tproxy &&
                    input.streamSettings.sockopt.tproxy !== 'off')
            )
                throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', slot.uuid);
            const inbound = clone(input);
            inbound.listen = slot.listenAddress;
            inbound.port = slot.port;
            inbounds.push(inbound);
        }
        for (const input of nativeOutbounds) {
            const item = clone(input);
            item.tag = outbound(item.tag);
            if (item.proxySettings !== undefined) {
                if (!object(item.proxySettings)) throw new PortPlanError('INVALID_PROFILE');
                item.proxySettings.tag = outbound(item.proxySettings.tag);
            }
            if (
                object(item.streamSettings) &&
                object(item.streamSettings.sockopt) &&
                item.streamSettings.sockopt.dialerProxy
            ) {
                item.streamSettings.sockopt.dialerProxy = outbound(
                    item.streamSettings.sockopt.dialerProxy,
                );
            }
            if (item.protocol === 'loopback' && object(item.settings)) {
                if (
                    typeof item.settings.inboundTag !== 'string' ||
                    !allowed.has(item.settings.inboundTag)
                )
                    throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', slots[0].uuid);
            }
            outbounds.push(item);
        }
        if (profile.routing !== undefined && !object(profile.routing))
            throw new PortPlanError('INVALID_PROFILE');
        const routing = profile.routing as JsonObject | undefined;
        // Lua returns original outbound tags and cannot be rewritten as scoped
        // field rules. Keep it in the ordinary profile path until the native
        // per-profile router owns its complete configuration.
        if (routing?.script !== undefined && routing.script !== '')
            throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', slots[0].uuid);
        const options = Object.fromEntries(
            Object.entries(routing ?? {}).filter(([key]) => key !== 'rules' && key !== 'balancers'),
        );
        if (routingOptions && canonical(routingOptions) !== canonical(options))
            throw new PortPlanError('INCOMPATIBLE_GLOBAL_SETTINGS', slots[0].uuid);
        routingOptions ??= clone(options);
        const nativeBalancers = objects(routing?.balancers),
            balancerTags = tagged(nativeBalancers);
        for (const input of nativeBalancers) {
            const item = clone(input);
            item.tag = prefix + 'b:' + item.tag;
            const selectors = strings(item.selector);
            if (
                !selectors.length ||
                selectors.some(
                    (selector) => ![...outboundTags].some((tag) => tag.startsWith(selector)),
                )
            )
                throw new PortPlanError('UNKNOWN_REFERENCE', slots[0].uuid);
            item.selector = selectors.map((selector) => prefix + 'o:' + selector);
            if (item.fallbackTag) item.fallbackTag = outbound(item.fallbackTag);
            if (
                object(item.strategy) &&
                object(item.strategy.settings) &&
                item.strategy.settings.costs !== undefined &&
                (!Array.isArray(item.strategy.settings.costs) ||
                    item.strategy.settings.costs.length)
            )
                throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', slots[0].uuid);
            balancers.push(item);
        }
        for (const input of objects(routing?.rules)) {
            const item = clone(input);
            const originalTags =
                item.inboundTag === undefined || item.inboundTag === null
                    ? []
                    : strings(item.inboundTag);
            const tags = originalTags.length
                ? originalTags.filter((tag) => allowed.has(tag))
                : [...allowed];
            if (!tags.length) continue;
            item.inboundTag = tags;
            if (item.outboundTag !== undefined) item.outboundTag = outbound(item.outboundTag);
            if (item.balancerTag !== undefined) {
                if (typeof item.balancerTag !== 'string' || !balancerTags.has(item.balancerTag))
                    throw new PortPlanError('UNKNOWN_REFERENCE', slots[0].uuid);
                item.balancerTag = prefix + 'b:' + item.balancerTag;
            }
            if ((item.outboundTag === undefined) === (item.balancerTag === undefined))
                throw new PortPlanError('INVALID_PROFILE', slots[0].uuid);
            if (typeof item.ruleTag === 'string') item.ruleTag = prefix + 'r:' + item.ruleTag;
            rules.push(item);
        }
        rules.push({
            type: 'field',
            inboundTag: [...allowed],
            outboundTag: outbound(nativeOutbounds[0].tag),
        });
        for (const name of ['observatory', 'burstObservatory']) {
            if (profile[name] === undefined) continue;
            if (!object(profile[name])) throw new PortPlanError('INVALID_PROFILE');
            const observation = clone(profile[name]);
            const selector = strings(observation.subjectSelector);
            if (
                !selector.length ||
                selector.some((part) => ![...outboundTags].some((tag) => tag.startsWith(part)))
            )
                throw new PortPlanError('UNKNOWN_REFERENCE', slots[0].uuid);
            observation.subjectSelector = selector.map((part) => prefix + 'o:' + part);
            const previous = observations.get(name);
            if (previous) {
                const settings = ({ ...o }: JsonObject) => {
                    delete o.subjectSelector;
                    return o;
                };
                if (canonical(settings(previous)) !== canonical(settings(observation)))
                    throw new PortPlanError('PROFILE_FEATURE_NEEDS_ISOLATION', slots[0].uuid);
                previous.subjectSelector = [
                    ...strings(previous.subjectSelector),
                    ...strings(observation.subjectSelector),
                ];
            } else observations.set(name, observation);
        }
    }
    const plan = {
        ...common,
        inbounds,
        outbounds,
        routing: { ...routingOptions, rules, ...(balancers.length ? { balancers } : {}) },
        ...Object.fromEntries(observations),
    };
    if (outbounds.length > 4096 || Buffer.byteLength(JSON.stringify(plan)) > 4 * 1024 * 1024)
        throw new PortPlanError('PLAN_TOO_LARGE');
    return plan;
}

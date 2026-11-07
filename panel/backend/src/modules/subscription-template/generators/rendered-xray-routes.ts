import { ClientPoolError } from './client-pool';

type ObjectValue = Record<string, unknown>;

const invalidReference = (): never => {
    throw new ClientPoolError('xray-route-reference');
};

function object(value: unknown): ObjectValue {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidReference();
    return value as ObjectValue;
}

function array(value: unknown): unknown[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return invalidReference();
    return value;
}

function reference(value: unknown, tags: Set<string>): void {
    if (value === undefined || value === '') return;
    if (typeof value !== 'string' || !tags.has(value)) invalidReference();
}

export function assertRenderedXrayRoutes(config: object): void {
    const root = object(config);
    if (root.routing === undefined) return;
    const routing = object(root.routing);
    const outbounds = new Set<string>();
    for (const entry of array(root.outbounds)) {
        const tag = object(entry).tag;
        if (typeof tag === 'string' && tag) outbounds.add(tag);
    }
    const balancers = array(routing.balancers).map(object);
    const balancerTags = new Set<string>();
    for (const balancer of balancers)
        if (typeof balancer.tag === 'string' && balancer.tag) balancerTags.add(balancer.tag);
    for (const balancer of balancers) reference(balancer.fallbackTag, outbounds);
    for (const entry of array(routing.rules)) {
        const rule = object(entry);
        reference(rule.outboundTag, outbounds);
        reference(rule.balancerTag, balancerTags);
    }
}

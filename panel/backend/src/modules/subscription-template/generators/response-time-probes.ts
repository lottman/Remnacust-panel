import { ClientPoolError } from './client-pool';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

export function ensureResponseTimeProbes<T extends object>(input: T): T {
    const config = input as ObjectValue;
    const routing = config.routing;
    if (!object(routing) || !Array.isArray(routing.balancers)) return input;
    const prefixes = new Set<string>();
    for (const balancer of routing.balancers) {
        if (!object(balancer) || !object(balancer.strategy)) continue;
        if (balancer.strategy.type !== 'leastPing' || !Array.isArray(balancer.selector)) continue;
        for (const prefix of balancer.selector)
            if (typeof prefix === 'string' && prefix.length) prefixes.add(prefix);
    }
    if (!prefixes.size) return input;
    const key =
        config.observatory !== undefined
            ? 'observatory'
            : config.burstObservatory !== undefined
              ? 'burstObservatory'
              : 'observatory';
    const original = config[key];
    if (original !== undefined && !object(original))
        throw new ClientPoolError('autoselect-observer');
    const observer: ObjectValue = { ...original };
    const selectors = observer.subjectSelector ?? [];
    if (!Array.isArray(selectors) || selectors.some((value) => typeof value !== 'string'))
        throw new ClientPoolError('autoselect-observer-selector');
    const selected = new Set<string>(selectors);
    const covered = (prefix: string) => {
        for (let length = 0; length <= prefix.length; length++)
            if (selected.has(prefix.slice(0, length))) return true;
        return false;
    };
    observer.subjectSelector = [
        ...new Set([...selectors, ...[...prefixes].filter((prefix) => !covered(prefix))]),
    ];
    if (key === 'observatory') {
        if (observer.probeUrl === undefined && observer.probeURL === undefined)
            observer.probeUrl = 'https://www.gstatic.com/generate_204';
        if (observer.probeInterval === undefined) observer.probeInterval = '30s';
        if (observer.enableConcurrency === undefined) observer.enableConcurrency = true;
    } else {
        if (observer.pingConfig !== undefined && !object(observer.pingConfig))
            throw new ClientPoolError('autoselect-probe-settings');
        observer.pingConfig = {
            destination: 'https://www.gstatic.com/generate_204',
            interval: '30s',
            timeout: '5s',
            sampling: 2,
            httpMethod: 'HEAD',
            ...(observer.pingConfig as ObjectValue | undefined),
        };
    }
    return { ...input, [key]: observer };
}

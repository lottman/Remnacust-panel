import type { GeofileReference } from './materialize-geofiles';

import { createHash } from 'node:crypto';

import { ClientPoolError } from '../generators/client-pool';

export type DatKind = 'geoip' | 'geosite';
export type DatBundleUrl = (kind: DatKind, ids: string[]) => Promise<string>;
export const DAT_NAMESPACE_VERSION = 2;

export function datCategory(
    id: string,
    category: string,
    namespace: 1 | 2 = DAT_NAMESPACE_VERSION,
): string {
    const [code, attribute] = category.toLowerCase().split('@');
    const source =
        namespace === 1 ? id : createHash('sha256').update(id).digest('hex').slice(0, 12);
    const name = `r${source}_${createHash('sha256')
        .update(code)
        .digest('hex')
        .slice(0, namespace === 1 ? 24 : 16)}`;
    return name + (attribute ? `@${attribute}` : '');
}

export class XrayGeofileFallback extends ClientPoolError {
    constructor(public readonly reason: string) {
        super(`geofile-xray-${reason}`);
    }
}

// One collector belongs to one subscription response, never to a cached template.
export class XrayGeofileDelivery {
    public intervalHours?: number;

    constructor(public readonly client: 'happ' | 'incy' = 'happ') {}
    private readonly references = new Map<
        string,
        { kind: DatKind; id: string; target: string; interval: number }
    >();
    private bundleUrl?: DatBundleUrl;

    public register(kind: DatKind, reference: GeofileReference, bundleUrl: DatBundleUrl): string[] {
        this.bundleUrl ??= bundleUrl;
        return (reference.categories ?? []).map((category) => {
            const value = `${kind}:${datCategory(reference.id, category)}`;
            this.references.set(value, {
                kind,
                id: reference.id,
                target: reference.target,
                interval: reference.clientRefreshIntervalSeconds ?? 86400,
            });
            if (this.references.size > 1024) throw new XrayGeofileFallback('size');
            return value;
        });
    }

    public async header(
        subscription: string,
        profileKey: string,
        now = Date.now(),
    ): Promise<string | undefined> {
        if (!this.references.size || !this.bundleUrl) return undefined;
        const used = new Set<string>();
        const configs = JSON.parse(subscription);
        if (!Array.isArray(configs)) throw new XrayGeofileFallback('configuration');
        let existingGeodata = configs.some((config) => config?.geodata);
        const stack: unknown[] = [...configs];
        let visited = 0;
        while (stack.length) {
            if (++visited > 200_000) throw new XrayGeofileFallback('size');
            const value = stack.pop();
            if (typeof value === 'string' && /^(?:geoip|geosite):/i.test(value)) {
                const key = value.toLowerCase();
                if (this.references.has(key)) used.add(key);
                else existingGeodata = true;
            } else if (Array.isArray(value)) {
                for (const item of value) stack.push(item);
            } else if (value && typeof value === 'object') {
                for (const item of Object.values(value)) stack.push(item);
            }
        }
        if (!used.size) return undefined;
        if (existingGeodata) throw new XrayGeofileFallback('existing-geodata');
        const selected = [...used].sort();
        const interval = Math.max(...selected.map((key) => this.references.get(key)!.interval));
        // Force one refresh when migrating from the longer v1 names in the same interval.
        const revision = Math.floor(now / 1000 / interval) * interval + DAT_NAMESPACE_VERSION - 1;
        const profile: Record<string, unknown> = {
            Name: `Remnacust ${createHash('sha256').update(profileKey).digest('hex').slice(0, 12)}`,
            GlobalProxy: 'true',
            LastUpdated: String(revision),
        };
        for (const kind of ['geoip', 'geosite'] as const) {
            const values = selected.filter((key) => this.references.get(key)!.kind === kind);
            if (!values.length) continue;
            const ids = [...new Set(values.map((key) => this.references.get(key)!.id))].sort();
            try {
                const url = await this.bundleUrl(kind, ids);
                profile[kind === 'geoip' ? 'Geoipurl' : 'Geositeurl'] =
                    url + `${url.includes('?') ? '&' : '?'}revision=${revision}`;
            } catch {
                throw new XrayGeofileFallback('bundle');
            }
            for (const [action, field] of [
                ['DIRECT', 'Direct'],
                ['REJECT', 'Block'],
                ['PROXY', 'Proxy'],
            ]) {
                profile[field + (kind === 'geoip' ? 'Ip' : 'Sites')] = values.filter((key) => {
                    const target = this.references.get(key)!.target;
                    return action === 'PROXY'
                        ? !['DIRECT', 'REJECT'].includes(target)
                        : target === action;
                });
            }
        }
        const header =
            `${this.client}://routing/onadd/` +
            Buffer.from(JSON.stringify(profile)).toString('base64');
        // Leave room for ordinary response headers in a default 4 KiB reverse-proxy buffer.
        if (Buffer.byteLength(header) > 3000) throw new XrayGeofileFallback('header-size');
        this.intervalHours = Math.ceil(interval / 3600);
        return header;
    }
}

export function xrayGeofileClient(userAgent: string): 'happ' | 'incy' | undefined {
    const match = /^(Happ|INCY)\/\d+(?:\.\d+)+\b/i.exec(userAgent.slice(0, 512));
    return match?.[1].toLowerCase() as 'happ' | 'incy' | undefined;
}

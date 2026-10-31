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
    public inlineOnly = false;
    private containsInline = false;

    public registerInline(): void {
        this.containsInline = true;
    }

    constructor(
        public readonly client: 'happ' | 'incy' = 'happ',
        public readonly mode: 'inline' | 'remote' = 'remote',
        private readonly title = 'Subscription',
    ) {}

    private profileName(profileKey: string): string {
        let name = this.title.slice(0, 8192);
        if (name.startsWith('base64:')) {
            try {
                name = new TextDecoder('utf-8', { fatal: true }).decode(
                    Buffer.from(name.slice(7), 'base64'),
                );
            } catch {
                name = '';
            }
        }
        // The suffix isolates two subscriptions with the same visible title.
        const clean = [...name.normalize('NFC')]
            .filter((char) => char.codePointAt(0)! >= 32 && char.codePointAt(0)! !== 127)
            .join('')
            .trim();
        return `${[...clean].slice(0, 80).join('') || 'Subscription'} · ${createHash('sha256').update(profileKey).digest('hex').slice(0, 8)}`;
    }
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

    private inlineHeader(profileKey: string, now: number): string | undefined {
        if (!this.containsInline) return undefined;
        // Absence of a routing header leaves the previous provider profile on
        // the device. Replace that profile's old URLs instead of disabling
        // the client's routing feature or deleting unrelated profiles.
        this.inlineOnly = true;
        this.intervalHours = 0;
        const profile = {
            Name: this.profileName(profileKey),
            GlobalProxy: 'true',
            Geoipurl: '',
            Geositeurl: '',
            DirectIp: [],
            DirectSites: [],
            BlockIp: [],
            BlockSites: [],
            ProxyIp: [],
            ProxySites: [],
            LastUpdated: String(Math.floor(now / 1000)),
        };
        return (
            `${this.client}://routing/onadd/` +
            Buffer.from(JSON.stringify(profile)).toString('base64')
        );
    }

    public async header(
        subscription: string,
        profileKey: string,
        now = Date.now(),
    ): Promise<string | undefined> {
        this.inlineOnly = false;
        this.intervalHours = undefined;
        if ((!this.references.size || !this.bundleUrl) && !this.containsInline) return undefined;
        const used = new Set<string>();
        const configs = JSON.parse(subscription);
        if (!Array.isArray(configs)) throw new XrayGeofileFallback('configuration');
        let existingGeodata = configs.some((config) => config?.geodata);
        // Like the size budget, complexity belongs to one client profile.
        // A valid subscription may repeat the same rules on many hosts.
        for (const config of configs) {
            const stack: unknown[] = [config];
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
        }
        if (!used.size) return existingGeodata ? undefined : this.inlineHeader(profileKey, now);
        if (existingGeodata) throw new XrayGeofileFallback('existing-geodata');
        if (!this.bundleUrl) throw new XrayGeofileFallback('bundle');
        const selected = [...used].sort();
        const interval = Math.max(...selected.map((key) => this.references.get(key)!.interval));
        // Force one refresh when migrating from the longer v1 names in the same interval.
        const revision = Math.floor(now / 1000 / interval) * interval + DAT_NAMESPACE_VERSION - 1;
        const profile: Record<string, unknown> = {
            Name: this.profileName(profileKey),
            GlobalProxy: 'true',
            Geoipurl: '',
            Geositeurl: '',
            // INCY compares this with the saved profile, including an inline
            // replacement. A window-rounded value could move backwards after
            // downloads are re-enabled. Stable URLs and SHA-256 prevent an
            // unchanged DAT from being downloaded again.
            LastUpdated: String(this.client === 'incy' ? Math.floor(now / 1000) : revision),
        };
        for (const kind of ['geoip', 'geosite'] as const) {
            const values = selected.filter((key) => this.references.get(key)!.kind === kind);
            if (!values.length) continue;
            const ids = [...new Set(values.map((key) => this.references.get(key)!.id))].sort();
            try {
                const url = await this.bundleUrl(kind, ids);
                profile[kind === 'geoip' ? 'Geoipurl' : 'Geositeurl'] =
                    this.client === 'incy'
                        ? url
                        : url + `${url.includes('?') ? '&' : '?'}revision=${revision}`;
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
        let header =
            `${this.client}://routing/onadd/` +
            Buffer.from(JSON.stringify(profile)).toString('base64');
        if (Buffer.byteLength(header) > 3000) {
            // Full JSON already contains the complete ordered routing rules.
            // These mirrored lists are optional profile metadata, not the rules
            // consumed by Xray. Keep all DAT URLs without duplicating every tag
            // into an HTTP header when multiple files/categories are selected.
            for (const action of ['Direct', 'Block', 'Proxy'])
                for (const kind of ['Ip', 'Sites']) profile[action + kind] = [];
            header =
                `${this.client}://routing/onadd/` +
                Buffer.from(JSON.stringify(profile)).toString('base64');
        }
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

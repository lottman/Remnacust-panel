import type { GeofileReference } from './materialize-geofiles';

import { createHash } from 'node:crypto';

import { ClientPoolError } from '../generators/client-pool';
import { geofileInlineRuleLimit } from './geofile-inline-limit';
import {
    compactIncySubscription,
    xrayProfilesFit,
    XRAY_FORMATTED_CONFIG_BUDGET,
} from './incy-config';

export type DatKind = 'geoip' | 'geosite';
export type DatBundleUrl = (
    kind: DatKind,
    ids: string[],
    categories?: Record<string, string[]>,
) => Promise<string>;
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

const GEOFILE_STRING_LIST_FIELDS = new Set([
    'domain',
    'domains',
    'ip',
    'source',
    'sourceIP',
    'localIP',
    'expectedIPs',
    'expectIPs',
    'unexpectedIPs',
]);

function mapGeofileReferences(config: unknown, resolve: (value: string) => string): boolean {
    const stack: unknown[] = [config];
    let visited = 0;
    let changed = false;
    while (stack.length) {
        const value = stack.pop();
        if (!value || typeof value !== 'object') continue;
        for (const [field, item] of Object.entries(value)) {
            if (++visited > 200_000) throw new XrayGeofileFallback('size');
            if (typeof item !== 'string') {
                if (item && typeof item === 'object') stack.push(item);
                continue;
            }
            const list = !Array.isArray(value) && GEOFILE_STRING_LIST_FIELDS.has(field);
            if (list)
                for (let index = 0; index < item.length; index++)
                    if (item.charCodeAt(index) === 44 && ++visited > 200_000)
                        throw new XrayGeofileFallback('size');
            const parts = list ? item.split(',') : [item];
            const mapped = parts
                .map((part) => (/^(?:geoip|geosite):/i.test(part) ? resolve(part) : part))
                .join(',');
            if (mapped !== item) {
                (value as Record<string, unknown>)[field] = mapped;
                changed = true;
            }
        }
    }
    return changed;
}

// One collector belongs to one subscription response, never to a cached template.
export class XrayGeofileDelivery {
    public intervalHours?: number;
    public sourceRevision?: string;
    public inlineOnly = false;
    public scopedProfiles = false;
    private containsInline = false;
    public get hasManagedRules(): boolean {
        return this.containsInline || this.references.size > 0;
    }

    public registerInline(): void {
        this.containsInline = true;
    }

    constructor(
        public readonly client: 'happ' | 'incy' = 'happ',
        public readonly mode: 'inline' | 'remote' = 'remote',
        private readonly title = 'Subscription',
        inlineRuleLimit?: number,
        public readonly deferTemplates = false,
    ) {
        this.inlineRuleLimit = geofileInlineRuleLimit(inlineRuleLimit);
    }
    public readonly inlineRuleLimit: number;

    public get hasRemoteRules(): boolean {
        return this.references.size > 0;
    }

    public async renderProfile(
        generate: (delivery: XrayGeofileDelivery) => Promise<string | undefined>,
    ): Promise<string | undefined> {
        this.scopedProfiles = true;
        const render = async (mode: 'inline' | 'remote') => {
            const delivery = new XrayGeofileDelivery(
                this.client,
                mode,
                this.title,
                this.inlineRuleLimit,
            );
            const generated = await generate(delivery);
            if (generated === undefined) return;
            const resolved = delivery.resolveLegacyReferences(`[${generated}]`);
            const body =
                this.client === 'incy' ? compactIncySubscription(resolved, false) : resolved;
            if (
                !xrayProfilesFit(
                    body,
                    XRAY_FORMATTED_CONFIG_BUDGET,
                    mode === 'inline' && delivery.hasManagedRules ? this.inlineRuleLimit : Infinity,
                )
            )
                throw new ClientPoolError('geofile-client-config-size-limit');
            return { delivery, serialized: body.slice(1, -1) };
        };
        let result;
        try {
            result = await render('inline');
        } catch (error) {
            if (!isXrayGeofileSizeError(error)) throw error;
            result = await render('remote');
            if (result && !result.delivery.hasRemoteRules)
                throw new ClientPoolError('geofile-client-config-size-limit');
        }
        if (!result) return;
        const { delivery, serialized } = result;
        this.containsInline ||= delivery.containsInline;
        for (const [key, entry] of delivery.references) {
            const previous = this.references.get(key);
            if (previous && previous.sourceSha256 !== entry.sourceSha256)
                throw new XrayGeofileFallback('source-revision');
            this.references.set(key, {
                ...entry,
                interval: Math.max(previous?.interval ?? 0, entry.interval),
                ambiguous:
                    entry.ambiguous ||
                    (!!previous && (previous.ambiguous || previous.target !== entry.target)),
            });
        }
        if (this.references.size > 1024) throw new XrayGeofileFallback('size');
        this.bundleUrl ??= delivery.bundleUrl;
        return serialized;
    }

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
        {
            kind: DatKind;
            id: string;
            target: string;
            interval: number;
            category: string;
            ambiguous: boolean;
            sourceSha256?: string;
        }
    >();
    private bundleUrl?: DatBundleUrl;

    public register(
        kind: DatKind,
        reference: GeofileReference,
        bundleUrl: DatBundleUrl,
        sourceSha256?: string,
    ): string[] {
        if (sourceSha256 !== undefined && !/^[a-f0-9]{64}$/.test(sourceSha256))
            throw new XrayGeofileFallback('source-revision');
        this.bundleUrl ??= bundleUrl;
        return (reference.categories ?? []).map((category) => {
            const value = `${kind}:${datCategory(reference.id, category)}`;
            const previous = this.references.get(value);
            this.references.set(value, {
                kind,
                id: reference.id,
                target: reference.target,
                category: category.toLowerCase().split('@')[0],
                interval: Math.max(
                    previous?.interval ?? 0,
                    reference.clientRefreshIntervalSeconds ?? 86400,
                ),
                ambiguous:
                    !!previous && (previous.ambiguous || previous.target !== reference.target),
                sourceSha256,
            });
            if (this.references.size > 1024) throw new XrayGeofileFallback('size');
            return value;
        });
    }

    public resolveLegacyReferences(subscription: string): string {
        if (this.mode !== 'remote' || !this.references.size) return subscription;
        const configs = JSON.parse(subscription);
        if (!Array.isArray(configs)) throw new XrayGeofileFallback('configuration');
        const aliases = new Map<string, string | null>();
        for (const [key, entry] of this.references) {
            const attribute = key.includes('@') ? key.slice(key.indexOf('@')) : '';
            const alias = `${entry.kind}:${entry.category}${attribute}`;
            aliases.set(alias, aliases.has(alias) ? null : key);
        }
        let changed = false;
        for (const config of configs) {
            if (config?.geodata) throw new XrayGeofileFallback('existing-geodata');
            const mapped = mapGeofileReferences(config, (item) => {
                if (this.references.has(item.toLowerCase())) return item;
                const key = aliases.get(item.toLowerCase());
                if (!key) throw new XrayGeofileFallback('existing-geodata');
                this.references.get(key)!.ambiguous = true;
                return key;
            });
            changed ||= mapped;
        }
        return changed ? JSON.stringify(configs) : subscription;
    }

    private inlineHeader(profileKey: string, now: number): string | undefined {
        if (!this.containsInline) return undefined;
        // Absence of a routing header leaves the previous provider profile on
        // the device. Replace that profile's old URLs instead of disabling
        // the client's routing feature or deleting unrelated profiles.
        return this.retirementHeader(profileKey, now);
    }

    public retirementHeader(profileKey: string, now = Date.now(), restoreDefaults = false): string {
        this.inlineOnly = true;
        this.intervalHours = 0;
        const profile = {
            Name: this.profileName(profileKey),
            GlobalProxy: 'true',
            Geoipurl: restoreDefaults
                ? 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat'
                : '',
            Geositeurl: restoreDefaults
                ? 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat'
                : '',
            ...(restoreDefaults
                ? { [this.client === 'incy' ? 'useChunkFiles' : 'UseChunkFiles']: false }
                : {}),
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
        this.sourceRevision = undefined;
        if ((!this.references.size || !this.bundleUrl) && !this.containsInline) return undefined;
        const used = new Set<string>();
        const configs = JSON.parse(subscription);
        if (!Array.isArray(configs)) throw new XrayGeofileFallback('configuration');
        let existingGeodata = configs.some((config) => config?.geodata);
        // Like the size budget, complexity belongs to one client profile.
        // A valid subscription may repeat the same rules on many hosts.
        for (const config of configs) {
            mapGeofileReferences(config, (item) => {
                const key = item.toLowerCase();
                if (this.references.has(key)) used.add(key);
                else existingGeodata = true;
                return item;
            });
        }
        if (!used.size) return existingGeodata ? undefined : this.inlineHeader(profileKey, now);
        if (existingGeodata) throw new XrayGeofileFallback('existing-geodata');
        if (!this.bundleUrl) throw new XrayGeofileFallback('bundle');
        const selected = [...used].sort();
        const sources = selected
            .map((key) => this.references.get(key)!)
            .filter((entry) => entry.sourceSha256 !== undefined)
            .map((entry) => `${entry.kind}:${entry.id}:${entry.sourceSha256}`);
        this.sourceRevision = sources.length
            ? createHash('sha256')
                  .update(JSON.stringify([...new Set(sources)].sort()))
                  .digest('hex')
            : undefined;
        const interval = Math.max(...selected.map((key) => this.references.get(key)!.interval));
        // Force one refresh when migrating from the longer v1 names in the same interval.
        const revision = Math.floor(now / 1000 / interval) * interval + DAT_NAMESPACE_VERSION - 1;
        const profile: Record<string, unknown> = {
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
                const categories = Object.fromEntries(
                    ids.map((id) => [
                        id,
                        [
                            ...new Set(
                                values
                                    .filter((key) => this.references.get(key)!.id === id)
                                    .map((key) => this.references.get(key)!.category),
                            ),
                        ].sort(),
                    ]),
                );
                const url = await this.bundleUrl(kind, ids, categories);
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
                    const entry = this.references.get(key)!;
                    if (entry.ambiguous) return false;
                    const target = entry.target;
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

export function isXrayGeofileSizeError(error: unknown): boolean {
    return (
        error instanceof Error &&
        [
            'geofile-inline-limit',
            'geofile-config-size',
            'geofile-client-config-size-limit',
            'geofile-xray-size',
        ].includes(error.message)
    );
}

export function xrayGeofileClient(userAgent: string): 'happ' | 'incy' | undefined {
    const match = /^(Happ|INCY)\/\d+(?:\.\d+)+\b/i.exec(userAgent.slice(0, 512));
    return match?.[1].toLowerCase() as 'happ' | 'incy' | undefined;
}

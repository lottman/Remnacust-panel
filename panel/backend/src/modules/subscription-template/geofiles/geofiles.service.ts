import type { GeofileCopyData } from './geofile-multipart';

import { load } from 'js-yaml';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, lstat, rm, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { PrismaService } from '@common/database/prisma.service';

import { BoundedWorkQueue } from '../../../common/utils/bounded-work-queue';
import { requestGeofileBase } from '../../../common/utils/geofile-request-context';
import { ClientPoolError } from '../generators/client-pool';
import { SubscriptionTemplateRepository } from '../repositories/subscription-template.repository';
import { bundleDat } from './bundle-dat';
import { readBundleSelection, storeBundleSelection } from './bundle-selection';
import { compileDat, datCategories, DatRules } from './compile-dat';
import { downloadGeofile, MAX_GEOFILE_BYTES } from './download-geofile';
import { datClientFile } from './geofile-delivery';
import {
    editGeofileAsync,
    GeofileEdit,
    geofileContentAsync,
    validateGeofileAsync,
    datCategoriesAsync,
    compileDatAsync,
    validateNativeDatAsync,
    parseGeofileSelections,
    validateGeofileSelections,
} from './geofile-editor';
import { materializeGeofiles } from './materialize-geofiles';
import { GeofileOrigin, geofileProvenance } from './provenance';
import {
    GeofileRefreshState,
    GeofileRefreshStore,
    readGeofileRefresh,
    publishGeofileCurrent,
} from './refresh-geofile';
import {
    GEOFILE_EXTENSIONS,
    GEOFILE_KINDS,
    GeofileKind,
    validateGeofile,
} from './validate-geofile';
import { DatKind, XrayGeofileDelivery, XrayGeofileFallback } from './xray-geofile-delivery';

const MAX_FILES = 32;
const MAX_BUNDLED_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_BUNDLED_CACHE_ENTRIES = 16;
const ID = /^[0-9a-f]{34}$/;
export interface StoredGeofile {
    id: string;
    name: string;
    kind: GeofileKind;
    size: number;
    sha256: string;
    filename: string;
    createdAt: string;
    url: string;
    categories?: string[];
    origin?: GeofileOrigin;
    editPolicy?: 'copy' | 'edit';
    original?: { sha256: string; size: number; filename: string; url: string };
    editable?: boolean;
    replaceable?: boolean;
    refresh?: Omit<GeofileRefreshState, 'lease' | 'previousSha256'>;
}

@Injectable()
export class GeofilesService {
    private readonly root = join(
        process.env.XERA_BACKUPS_DIR ?? join(process.cwd(), 'backups'),
        'geofiles',
    );
    private active = 0;
    private compiling = 0;
    private readonly compiled = new Map<string, DatRules>();
    private readonly compilingByKey = new Map<string, Promise<DatRules>>();
    private readonly compileQueue = new BoundedWorkQueue(2, 32);
    private readonly bundled = new Map<string, Buffer>();
    private readonly bundlingByKey = new Map<string, Promise<Buffer>>();
    private readonly bundleQueue = new BoundedWorkQueue(2, 32);
    private bundling = 0;
    private readonly defaultBase: string;
    private get base(): string {
        return requestGeofileBase(this.defaultBase);
    }
    private readonly secret: string;
    private readonly refreshStore: GeofileRefreshStore;
    constructor(
        config: TypedConfigService,
        private readonly repository: SubscriptionTemplateRepository,
        private readonly prisma: PrismaService,
    ) {
        this.defaultBase = `https://${config.getOrThrow('SUB_PUBLIC_DOMAIN')}/geofiles/`;
        this.secret = config.getOrThrow('APP_SECRET');
        this.refreshStore = new GeofileRefreshStore({
            directory: (id) => this.directory(id),
            file: (id) => this.fileById(id),
            list: () => this.list(),
            lock: (operation) => this.withReferenceLock(operation),
            validate: (file, data) => this.validateReplacement(file, data),
            revision: () => this.referenceRevision(),
            protect: (file) => this.persistProvenance(file),
        });
    }

    private async persistProvenance(file: StoredGeofile): Promise<void> {
        if (file.origin !== 'preset') return;
        const directory = this.directory(file.id);
        const handle = await open(
            join(directory, 'meta.json'),
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        let original: StoredGeofile;
        try {
            original = JSON.parse(await handle.readFile('utf8')) as StoredGeofile;
        } finally {
            await handle.close();
        }
        if (original.origin === 'preset') return;
        const temporary = join(directory, `meta-${randomBytes(16).toString('hex')}.tmp`);
        try {
            await writeFile(
                temporary,
                JSON.stringify({ ...original, ...geofileProvenance('preset') }),
                { flag: 'wx', mode: 0o600 },
            );
            await rename(temporary, join(directory, 'meta.json'));
        } finally {
            await rm(temporary, { force: true });
        }
    }

    private async referenceRevision(): Promise<string> {
        return this.templatesRevision(await this.repository.getAllTemplates(true));
    }

    private templatesRevision(
        templates: Awaited<ReturnType<SubscriptionTemplateRepository['getAllTemplates']>>,
    ): string {
        return createHash('sha256')
            .update(
                JSON.stringify(
                    templates
                        .map((template) =>
                            JSON.stringify({
                                uuid: template.uuid,
                                templateType: template.templateType,
                                templateJson: template.templateJson,
                                templateYaml: template.templateYaml,
                            }),
                        )
                        .sort(),
                ),
            )
            .digest('hex');
    }

    private async validateReplacement(file: StoredGeofile, data: Buffer): Promise<string> {
        const templates = await this.repository.getAllTemplates(true);
        const revision = this.templatesRevision(templates);
        if (!['geoip', 'geosite'].includes(file.kind)) return revision;
        const selections = new Set<string>();
        const nativeCategories = new Set<string>();
        let nativeXray = false;
        for (const template of templates) {
            const config =
                template.templateJson ??
                (template.templateYaml
                    ? load(template.templateYaml, {
                          maxAliases: 100,
                          maxTotalMergeKeys: 10000,
                      })
                    : undefined);
            for (const reference of (config as any)?.remnacust?.geofiles ?? [])
                if (reference.id === file.id) {
                    if (
                        template.templateType === 'XRAY_JSON' &&
                        ['geoip', 'geosite'].includes(file.kind)
                    )
                        nativeXray = true;
                    selections.add(
                        JSON.stringify({
                            categories: reference.categories ?? [],
                            format: template.templateType,
                        }),
                    );
                }
            const native = await this.nativeReferences(config, file);
            for (const selection of native.selections) selections.add(JSON.stringify(selection));
            for (const category of native.categories) nativeCategories.add(category);
            nativeXray ||= native.native;
        }
        if (nativeCategories.size) {
            const available = new Set(await datCategoriesAsync(data));
            if ([...nativeCategories].some((category) => !available.has(category)))
                throw Error('geofile-category-empty');
        }
        for (const selection of selections) {
            const { categories, format } = JSON.parse(selection);
            let rules: DatRules;
            try {
                rules = await compileDatAsync(data, file.kind as 'geoip' | 'geosite', categories);
            } catch (error) {
                if (
                    format !== 'XRAY_JSON' ||
                    !(error instanceof Error) ||
                    error.message !== 'geofile-inline-limit'
                )
                    throw error;
                await compileDatAsync(data, file.kind as 'geoip' | 'geosite', categories, true);
                continue;
            }
            if (['SINGBOX', 'MIHOMO', 'CLASH', 'STASH'].includes(format))
                datClientFile(rules, format);
        }
        if (nativeXray) await validateNativeDatAsync(data, file.id);
        return revision;
    }

    private async nativeReferences(config: unknown, file: StoredGeofile) {
        const selections: Array<{ format: string; categories: string[] }> = [];
        const categories = new Set<string>();
        const stack: Array<{ value: unknown; depth: number }> = [{ value: config, depth: 0 }];
        const visited = new WeakSet<object>();
        let native = false,
            work = 0;
        while (stack.length) {
            const { value, depth } = stack.pop()!;
            if (++work % 1000 === 0) await setImmediate();
            if (work > 200_000 || depth > 32) throw Error('geofile-reference-complexity');
            if (value && typeof value === 'object') {
                if (visited.has(value)) continue;
                visited.add(value);
                for (const child of Object.values(value)) {
                    if (work + stack.length >= 200_000) throw Error('geofile-reference-complexity');
                    stack.push({ value: child, depth: depth + 1 });
                }
                continue;
            }
            if (typeof value !== 'string' || value.length > 8192 || !/^https?:\/\//i.test(value))
                continue;
            let url: URL;
            try {
                url = new URL(value);
            } catch {
                continue;
            }
            const derived = /\/geofiles\/([a-f0-9]{34})\/(rules-[A-Za-z0-9_.-]+)$/.exec(
                url.pathname,
            );
            if (derived && derived[1] === file.id) {
                const match = /^rules-([A-Za-z0-9_-]{1,2732})\.([a-f0-9]{64})\.(json|yaml)$/.exec(
                    derived[2],
                );
                if (
                    !match ||
                    !timingSafeEqual(
                        Buffer.from(match[2], 'hex'),
                        Buffer.from(this.derivedSignature(file.id, match[1]), 'hex'),
                    )
                )
                    continue;
                const payload = Buffer.from(match[1], 'base64url');
                if (payload.length > 2048 || payload.toString('base64url') !== match[1])
                    throw Error('geofile-reference');
                const selection = parseGeofileSelections([JSON.parse(payload.toString('utf8'))])[0];
                if (
                    selection.format === 'XRAY_JSON' ||
                    (selection.format === 'SINGBOX' ? 'json' : 'yaml') !== match[3]
                )
                    throw Error('geofile-reference');
                selections.push(selection);
            }
            const bundle =
                /\/geofiles\/([a-f0-9]{34})\/(?:bundles\/([A-Za-z0-9_-]{1,2732})\/)?bundle-([a-f0-9]{64})\.dat(?:\.sha256)?$/.exec(
                    url.pathname,
                );
            if (!bundle) continue;
            const encoded = bundle[2] ?? url.searchParams.get('selection');
            if (
                typeof encoded !== 'string' ||
                !/^[A-Za-z0-9_-]{1,2732}$/.test(encoded) ||
                !timingSafeEqual(
                    Buffer.from(bundle[3], 'hex'),
                    Buffer.from(this.bundleSignature(bundle[1], encoded), 'hex'),
                )
            )
                continue;
            let manifest: {
                kind: string;
                ids: string[];
                namespace?: number;
                categories?: Record<string, string[]>;
            };
            if (/^m-[a-f0-9]{64}$/.test(encoded))
                manifest = await readBundleSelection(this.directory(bundle[1]), encoded);
            else {
                const payload = Buffer.from(encoded, 'base64url');
                if (payload.length > 2048 || payload.toString('base64url') !== encoded)
                    throw Error('geofile-reference');
                manifest = JSON.parse(payload.toString('utf8'));
            }
            if (
                !Array.isArray(manifest.ids) ||
                manifest.ids[0] !== bundle[1] ||
                manifest.ids.length > 32 ||
                manifest.ids.some((id) => typeof id !== 'string' || !ID.test(id)) ||
                !['geoip', 'geosite'].includes(manifest.kind) ||
                ![1, 2].includes(manifest.namespace ?? 1)
            )
                throw Error('geofile-reference');
            if (!manifest.ids.includes(file.id)) continue;
            if (manifest.kind !== file.kind) throw Error('geofile-reference');
            const selected =
                manifest.categories?.[file.id] ??
                (await datCategoriesAsync(await this.readActive(this.activeFile(file))));
            for (const category of selected) categories.add(category);
            native = true;
        }
        return { selections, categories, native };
    }

    private directory(id: string): string {
        if (!ID.test(id)) throw new NotFoundException('Geofile not found');
        const slot = Number.parseInt(id.slice(0, 2), 16);
        if (slot >= MAX_FILES) throw new NotFoundException('Geofile not found');
        return join(this.root, String(slot).padStart(2, '0'));
    }

    private async metadata(directory: string): Promise<StoredGeofile> {
        const directoryInfo = await lstat(directory);
        if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
            throw new Error('Invalid geofile directory');
        const metaInfo = await lstat(join(directory, 'meta.json'));
        if (!metaInfo.isFile() || metaInfo.isSymbolicLink())
            throw Error('Invalid geofile metadata');
        const meta = await open(
            join(directory, 'meta.json'),
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        let item: StoredGeofile;
        try {
            const info = await meta.stat();
            if (!info.isFile() || info.size > 256 * 1024)
                throw new Error('Invalid geofile metadata');
            item = JSON.parse(await meta.readFile('utf8')) as StoredGeofile;
        } finally {
            await meta.close();
        }
        if (
            !ID.test(item.id) ||
            this.directory(item.id) !== directory ||
            !GEOFILE_KINDS.includes(item.kind) ||
            item.filename !== `${item.sha256}.${GEOFILE_EXTENSIONS[item.kind]}` ||
            !/^[a-f0-9]{64}$/.test(item.sha256)
        )
            throw new Error('Invalid geofile metadata');
        const refresh = await readGeofileRefresh(directory);
        if (refresh) {
            delete refresh.lease;
            delete refresh.previousSha256;
        }
        return {
            ...item,
            ...geofileProvenance(item.origin, refresh?.sourceUrl),
            url: this.base + item.id + '/' + item.filename,
            ...(refresh
                ? { refresh, categories: refresh.current?.categories ?? item.categories }
                : {}),
        };
    }

    private async fileById(id: string) {
        const file = await this.metadata(this.directory(id));
        if (file.id !== id) throw Object.assign(new Error('geofile-not-found'), { code: 'ENOENT' });
        return file;
    }

    private activeFile(file: StoredGeofile): StoredGeofile {
        const current = file.refresh?.current;
        return {
            ...file,
            original: file.original ?? {
                sha256: file.sha256,
                size: file.size,
                filename: file.filename,
                url: file.url,
            },
            editable:
                file.editPolicy !== 'copy' &&
                file.kind !== 'singbox-srs' &&
                (['geoip', 'geosite'].includes(file.kind) ||
                    (current?.size ?? file.size) <= 8 * 1024 * 1024),
            replaceable: file.editPolicy !== 'copy',
            ...(current
                ? {
                      sha256: current.sha256,
                      size: current.size,
                      filename: `${current.sha256}.${GEOFILE_EXTENSIONS[file.kind]}`,
                  }
                : {}),
            url: this.base + file.id + `/latest.${GEOFILE_EXTENSIONS[file.kind]}`,
        };
    }

    private async readActive(file: StoredGeofile): Promise<Buffer> {
        const path = join(
            this.directory(file.id),
            file.refresh?.current ? `current-${file.sha256}` : 'data',
        );
        const before = await lstat(path);
        if (!before.isFile() || before.isSymbolicLink()) throw Error('geofile-integrity');
        const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        try {
            const info = await handle.stat();
            if (!info.isFile() || info.size !== file.size || info.size > MAX_GEOFILE_BYTES)
                throw new Error('geofile-integrity');
            const data = await handle.readFile();
            if (createHash('sha256').update(data).digest('hex') !== file.sha256)
                throw new Error('geofile-integrity');
            return data;
        } finally {
            await handle.close();
        }
    }

    private derivedSignature(id: string, payload: string): string {
        return createHmac('sha256', this.secret)
            .update(`remnacust-geofile-v1:${id}:${payload}`)
            .digest('hex');
    }

    private bundleSignature(id: string, payload: string): string {
        return createHmac('sha256', this.secret)
            .update(`remnacust-xray-dat-v1:${id}:${payload}`)
            .digest('hex');
    }

    private async bundleContent(
        kind: DatKind,
        ids: string[],
        namespace: 1 | 2 = 2,
        categories?: Record<string, string[]>,
    ): Promise<Buffer> {
        if (
            !['geoip', 'geosite'].includes(kind) ||
            !Array.isArray(ids) ||
            !ids.length ||
            ids.length > MAX_FILES ||
            ids.some((id) => typeof id !== 'string' || !ID.test(id)) ||
            new Set(ids).size !== ids.length
        )
            throw new Error('geofile-bundle');
        const files: StoredGeofile[] = [];
        let bytes = 0;
        for (const id of ids) {
            const file = this.activeFile(await this.fileById(id));
            if (file.kind !== kind || (bytes += file.size) > MAX_GEOFILE_BYTES)
                throw new Error('geofile-bundle');
            files.push(file);
        }
        const key =
            namespace +
            ':' +
            files.map((file) => `${file.id}:${file.sha256}`).join(',') +
            ':' +
            JSON.stringify(categories ?? null);
        const cached = this.bundled.get(key);
        if (cached) {
            this.bundled.delete(key);
            this.bundled.set(key, cached);
            return cached;
        }
        const pending = this.bundlingByKey.get(key);
        if (pending) return pending;
        const submitted = this.bundleQueue.submit(async () => {
            this.bundling++;
            try {
                const sources = [];
                for (const file of files)
                    sources.push({ id: file.id, data: await this.readActive(file) });
                const data = bundleDat(sources, namespace, categories);
                if (data.length <= MAX_BUNDLED_CACHE_BYTES) {
                    while (
                        this.bundled.size &&
                        (this.bundled.size >= MAX_BUNDLED_CACHE_ENTRIES ||
                            [...this.bundled.values()].reduce(
                                (sum, value) => sum + value.length,
                                0,
                            ) +
                                data.length >
                                MAX_BUNDLED_CACHE_BYTES)
                    )
                        this.bundled.delete(this.bundled.keys().next().value!);
                    this.bundled.set(key, data);
                }
                return data;
            } finally {
                this.bundling--;
            }
        });
        if (!submitted) throw new ServiceUnavailableException('geofile-busy');
        const operation = submitted.finally(() => this.bundlingByKey.delete(key));
        this.bundlingByKey.set(key, operation);
        return operation;
    }

    private async bundleUrl(
        kind: DatKind,
        ids: string[],
        categories?: Record<string, string[]>,
    ): Promise<string> {
        const ordered = [...ids].sort();
        const content = await this.bundleContent(kind, ordered, 2, categories);
        const revision = createHash('sha256').update(content).digest('hex');
        if (categories) {
            const selection = { kind, ids: ordered, namespace: 2 as const, categories, revision };
            const key = await storeBundleSelection(this.directory(ordered[0]), selection);
            if (key) {
                return `${this.base}${ordered[0]}/bundles/${key}/bundle-${this.bundleSignature(ordered[0], key)}.dat`;
            }
        }
        await this.bundleContent(kind, ordered);
        const payload = Buffer.from(
            JSON.stringify({ kind, ids: ordered, namespace: 2, revision }),
        ).toString('base64url');
        if (payload.length > 2732) throw new Error('geofile-bundle-size');
        // Some clients append .sha256 to the entire URL, including its query.
        // Put the authenticated selection in the path so both requests stay valid.
        return `${this.base}${ordered[0]}/bundles/${payload}/bundle-${this.bundleSignature(ordered[0], payload)}.dat`;
    }

    public async bundle(id: string, filename: string, selection: unknown): Promise<Buffer> {
        try {
            const match = /^bundle-([a-f0-9]{64})\.dat(?:\.sha256)?$/.exec(filename);
            if (
                !ID.test(id) ||
                !match ||
                typeof selection !== 'string' ||
                !/^[A-Za-z0-9_-]{1,2732}$/.test(selection) ||
                !timingSafeEqual(
                    Buffer.from(match[1], 'hex'),
                    Buffer.from(this.bundleSignature(id, selection), 'hex'),
                )
            )
                throw new Error('geofile-bundle');
            if (/^m-[a-f0-9]{64}$/.test(selection)) {
                const manifest = await readBundleSelection(this.directory(id), selection);
                if (manifest.ids[0] !== id) throw new Error('geofile-bundle');
                const data = await this.bundleContent(
                    manifest.kind,
                    manifest.ids,
                    2,
                    manifest.categories,
                );
                return filename.endsWith('.sha256')
                    ? Buffer.from(createHash('sha256').update(data).digest('hex'))
                    : data;
            }
            const raw = Buffer.from(selection, 'base64url');
            if (raw.length > 2048 || raw.toString('base64url') !== selection)
                throw new Error('geofile-bundle');
            const { kind, ids, namespace = 1 } = JSON.parse(raw.toString('utf8'));
            if (!Array.isArray(ids) || ids[0] !== id || ![1, 2].includes(namespace))
                throw new Error('geofile-bundle');
            const data = await this.bundleContent(kind, ids, namespace);
            return filename.endsWith('.sha256')
                ? Buffer.from(createHash('sha256').update(data).digest('hex'))
                : data;
        } catch (error) {
            if (error instanceof ServiceUnavailableException) throw error;
            throw new NotFoundException('Geofile not found');
        }
    }

    private derivedUrl(file: StoredGeofile, categories: string[], format: string): string {
        const json = JSON.stringify({ format, categories });
        if (Buffer.byteLength(json) > 2048) throw new Error('geofile-categories-size');
        const payload = Buffer.from(json).toString('base64url');
        return (
            this.base +
            file.id +
            `/rules-${payload}.${this.derivedSignature(file.id, payload)}.${format === 'SINGBOX' ? 'json' : 'yaml'}`
        );
    }

    public async derived(id: string, filename: string): Promise<Buffer> {
        try {
            const match = /^rules-([A-Za-z0-9_-]{1,2732})\.([a-f0-9]{64})\.(json|yaml)$/.exec(
                filename,
            );
            if (
                !match ||
                !timingSafeEqual(
                    Buffer.from(match[2], 'hex'),
                    Buffer.from(this.derivedSignature(id, match[1]), 'hex'),
                )
            )
                throw new NotFoundException('Geofile not found');
            const payload = Buffer.from(match[1], 'base64url');
            if (payload.length > 2048 || payload.toString('base64url') !== match[1])
                throw new NotFoundException('Geofile not found');
            const selection = JSON.parse(payload.toString('utf8')) as {
                format: string;
                categories: string[];
            };
            if (
                !['SINGBOX', 'MIHOMO', 'CLASH', 'STASH'].includes(selection.format) ||
                (selection.format === 'SINGBOX' ? 'json' : 'yaml') !== match[3]
            )
                throw new NotFoundException('Geofile not found');
            const file = this.activeFile(await this.fileById(id));
            if (file.kind !== 'geoip' && file.kind !== 'geosite')
                throw new NotFoundException('Geofile not found');
            const rules = await this.compile(file, selection.categories);
            return datClientFile(rules, selection.format);
        } catch (error) {
            if (error instanceof ServiceUnavailableException) throw error;
            throw new NotFoundException('Geofile not found');
        }
    }

    private async compile(
        file: StoredGeofile,
        categories: string[],
        validateOnly = false,
    ): Promise<DatRules> {
        const key =
                file.id +
                ':' +
                file.sha256 +
                ':' +
                JSON.stringify(categories) +
                (validateOnly ? ':validate' : ''),
            cached = this.compiled.get(key);
        if (cached) return cached;
        const pending = this.compilingByKey.get(key);
        if (pending) return pending;
        const submitted = this.compileQueue.submit(async () => {
            this.compiling++;
            try {
                const rules = compileDat(
                    await this.readActive(file),
                    file.kind as 'geoip' | 'geosite',
                    categories,
                    validateOnly,
                );
                if (this.compiled.size >= 32)
                    this.compiled.delete(this.compiled.keys().next().value!);
                this.compiled.set(key, rules);
                return rules;
            } finally {
                this.compiling--;
            }
        });
        if (!submitted) throw new ServiceUnavailableException('geofile-busy');
        const operation = submitted.finally(() => this.compilingByKey.delete(key));
        this.compilingByKey.set(key, operation);
        return operation;
    }

    public async configureRefresh(
        id: string,
        options: { sourceUrl?: unknown; enabled?: unknown; intervalSeconds?: unknown },
    ) {
        try {
            await this.refreshStore.configure(id, options);
            return this.activeFile(await this.fileById(id));
        } catch {
            throw new BadRequestException('geofile-refresh-settings');
        }
    }
    public async refreshNow(id: string) {
        return this.refreshStore.refresh(id, true);
    }
    public async refreshDue() {
        const settings = await this.prisma.subscriptionSettings.findFirst({
            select: { geofilesEnabled: true },
        });
        if (!settings?.geofilesEnabled) return [];
        return this.refreshStore.refreshDue();
    }

    private async editorWork<T>(operation: () => Promise<T>): Promise<T> {
        if (this.active >= 2) throw new ServiceUnavailableException('geofile-busy');
        this.active++;
        try {
            return await operation();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                throw new NotFoundException('Geofile not found');
            throw error;
        } finally {
            this.active--;
        }
    }

    private expectedSha(value: unknown): string {
        if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
            throw new BadRequestException('geofile-sha256-required');
        return value;
    }

    private assertSha(file: StoredGeofile, sha256: string) {
        if (file.sha256 !== sha256) throw new ConflictException('geofile-stale');
    }

    private copyName(value: unknown): string {
        if (
            typeof value !== 'string' ||
            !value.trim() ||
            value.length > 128 ||
            [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
        )
            throw new BadRequestException('geofile-name-or-kind');
        return value.trim();
    }

    public async content(
        id: string,
        query: { category?: unknown; page?: unknown; limit?: unknown; search?: unknown },
    ) {
        return this.editorWork(async () => {
            const file = this.activeFile(await this.fileById(id));
            const data = await this.readActive(file);
            try {
                return {
                    file,
                    ...(await geofileContentAsync(data, file.kind, {
                        ...query,
                        category: query.category ?? file.categories?.[0],
                    })),
                };
            } catch {
                throw new BadRequestException('geofile-content-query');
            }
        });
    }

    public async editContent(id: string, patch: GeofileEdit, copy = false): Promise<StoredGeofile> {
        return this.editorWork(async () => {
            if (
                !patch ||
                typeof patch !== 'object' ||
                Array.isArray(patch) ||
                (!copy && (patch.name !== undefined || patch.selections !== undefined))
            )
                throw new BadRequestException('geofile-edit');
            const sha256 = this.expectedSha(patch.sha256);
            const file = this.activeFile(await this.fileById(id));
            this.assertSha(file, sha256);
            if (!copy && file.editPolicy === 'copy')
                throw new ConflictException('geofile-copy-required');
            if (!copy && file.kind === 'singbox-srs')
                throw new BadRequestException('geofile-binary-replacement-required');
            const name = copy ? this.copyName(patch.name) : undefined;
            let selections;
            try {
                selections = parseGeofileSelections(patch.selections);
            } catch {
                throw new BadRequestException('geofile-copy-selections');
            }
            let data: Buffer;
            try {
                data = await editGeofileAsync(await this.readActive(file), file.kind, patch);
            } catch {
                throw new BadRequestException('geofile-edit-invalid');
            }
            if (copy) {
                try {
                    await validateGeofileSelections(data, file.kind, selections, file.id);
                } catch {
                    throw new BadRequestException('geofile-copy-selections');
                }
            }
            return this.commitEdited(file, data, sha256, name);
        });
    }

    public async replaceData(
        id: string,
        sha: unknown,
        read: () => Promise<Buffer>,
        name?: unknown,
        selected?: unknown,
    ): Promise<StoredGeofile> {
        return this.editorWork(async () => {
            const sha256 = this.expectedSha(sha);
            const file = this.activeFile(await this.fileById(id));
            this.assertSha(file, sha256);
            const copyName = name === undefined ? undefined : this.copyName(name);
            let selections;
            try {
                if (copyName === undefined && selected !== undefined)
                    throw Error('geofile-copy-selections');
                selections = parseGeofileSelections(selected);
            } catch {
                throw new BadRequestException('geofile-copy-selections');
            }
            if (copyName === undefined && file.editPolicy === 'copy')
                throw new ConflictException('geofile-copy-required');
            let data: Buffer;
            try {
                data = await read();
                await validateGeofileAsync(data, file.kind);
            } catch {
                throw new BadRequestException('geofile-invalid-or-unreachable');
            }
            if (copyName !== undefined) {
                try {
                    await validateGeofileSelections(data, file.kind, selections, file.id);
                } catch {
                    throw new BadRequestException('geofile-copy-selections');
                }
            }
            return this.commitEdited(file, data, sha256, copyName);
        });
    }

    public async copyData(
        id: string,
        sha: unknown,
        read: () => Promise<GeofileCopyData>,
    ): Promise<StoredGeofile> {
        return this.editorWork(async () => {
            const expected = this.expectedSha(sha);
            const file = this.activeFile(await this.fileById(id));
            this.assertSha(file, expected);
            let input: GeofileCopyData;
            try {
                input = await read();
            } catch {
                throw new BadRequestException('geofile-multipart');
            }
            const name = this.copyName(input.name);
            try {
                await validateGeofileAsync(input.data, file.kind);
                await validateGeofileSelections(
                    input.data,
                    file.kind,
                    parseGeofileSelections(input.selections),
                    file.id,
                );
            } catch {
                throw new BadRequestException('geofile-copy-selections');
            }
            return this.commitEdited(file, input.data, expected, name);
        });
    }

    private async commitEdited(
        file: StoredGeofile,
        data: Buffer,
        expected: string,
        name?: string,
    ): Promise<StoredGeofile> {
        let revision: string | undefined;
        try {
            if (name === undefined) revision = await this.validateReplacement(file, data);
        } catch {
            throw new BadRequestException('geofile-referenced-content-invalid');
        }
        const sha256 = createHash('sha256').update(data).digest('hex');
        const categories = ['geoip', 'geosite'].includes(file.kind)
            ? (await datCategoriesAsync(data)).slice(0, 1000)
            : undefined;
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const rootInfo = await lstat(this.root);
        if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
            throw new BadRequestException('geofile-storage');
        const staging = join(this.root, `editor-${randomBytes(16).toString('hex')}`);
        await mkdir(staging, { mode: 0o700 });
        try {
            await writeFile(join(staging, 'data'), data, { flag: 'wx', mode: 0o600 });
            return await this.withReferenceLock(async () => {
                const source = this.activeFile(await this.fileById(file.id));
                this.assertSha(source, expected);
                if (name !== undefined) {
                    const folded = (value: string) => value.trim().normalize('NFKC').toLowerCase();
                    if (
                        folded(name) === folded(source.name) ||
                        (await this.list()).some((item) => folded(item.name) === folded(name))
                    )
                        throw new ConflictException('geofile-name-exists');
                    for (let slot = 0; slot < MAX_FILES; slot++) {
                        const directory = join(this.root, String(slot).padStart(2, '0'));
                        try {
                            await lstat(directory);
                            continue;
                        } catch (error) {
                            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                        }
                        const id =
                            slot.toString(16).padStart(2, '0') + randomBytes(16).toString('hex');
                        const item: StoredGeofile = {
                            id,
                            name,
                            kind: file.kind,
                            sha256,
                            size: data.length,
                            filename: `${sha256}.${GEOFILE_EXTENSIONS[file.kind]}`,
                            createdAt: new Date().toISOString(),
                            url: '',
                            ...geofileProvenance('copy'),
                            ...(categories ? { categories } : {}),
                        };
                        await writeFile(join(staging, 'meta.json'), JSON.stringify(item), {
                            flag: 'wx',
                            mode: 0o600,
                        });
                        await rename(staging, directory);
                        return this.activeFile(await this.fileById(id));
                    }
                    throw new ConflictException('geofile-storage-full');
                }
                if (source.editPolicy === 'copy')
                    throw new ConflictException('geofile-copy-required');
                if (revision !== (await this.referenceRevision()))
                    throw new ConflictException('geofile-references-changed');
                const directory = this.directory(file.id);
                const state: GeofileRefreshState = (await readGeofileRefresh(directory)) ?? {
                    enabled: false,
                    intervalSeconds: 86400,
                };
                const previous = state.current?.sha256;
                const obsolete = state.previousSha256;
                const previousState = structuredClone(state);
                state.current = {
                    sha256,
                    size: data.length,
                    updatedAt: new Date().toISOString(),
                    ...(categories ? { categories } : {}),
                };
                state.enabled = false;
                state.previousSha256 = previous;
                delete state.lease;
                delete state.lastError;
                delete state.nextRefreshAt;
                await publishGeofileCurrent(directory, join(staging, 'data'), state, previousState);
                if (obsolete && obsolete !== sha256 && obsolete !== previous)
                    await rm(join(directory, `current-${obsolete}`), { force: true }).catch(
                        () => undefined,
                    );
                return this.activeFile(await this.fileById(file.id));
            });
        } finally {
            await rm(staging, { recursive: true, force: true });
        }
    }

    public async list(): Promise<StoredGeofile[]> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const result: StoredGeofile[] = [];
        for (let slot = 0; slot < MAX_FILES; slot++) {
            try {
                result.push(
                    this.activeFile(
                        await this.metadata(join(this.root, String(slot).padStart(2, '0'))),
                    ),
                );
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
        }
        return result.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    public async withReferenceLock<T>(operation: () => Promise<T>): Promise<T> {
        return this.prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(72626375)`;
                return operation();
            },
            { timeout: 15_000, maxWait: 5_000 },
        );
    }

    public async assertReferences(content: string): Promise<void> {
        const files = await this.list();
        const references = content.split(this.base).slice(1);
        for (const suffix of references) {
            const match = /^([a-f0-9]{34})\/([A-Za-z0-9_.-]{1,3000})/.exec(suffix);
            const file = match && files.find((file) => file.id === match[1]);
            if (!match || !file) throw new BadRequestException('geofile-reference');
            if (match[2].startsWith('rules-')) await this.derived(file.id, match[2]);
            else if (![file.filename, `latest.${GEOFILE_EXTENSIONS[file.kind]}`].includes(match[2]))
                throw new BadRequestException('geofile-reference');
        }
    }

    public async prepare(
        config: Record<string, unknown>,
        type: string,
        happ?: XrayGeofileDelivery,
        mode?: 'inline' | 'remote',
    ): Promise<Record<string, unknown>> {
        try {
            return await materializeGeofiles(
                config,
                type,
                async (id) => this.activeFile(await this.fileById(id)),
                (file, categories) => this.compile(file, categories),
                {
                    read: (file) => this.readActive(file),
                    validateDat: async (file, categories) => {
                        await this.compile(file, categories, true);
                    },
                    datUrl: (file, categories, format) => this.derivedUrl(file, categories, format),
                    datBundleUrl: (kind, ids, categories) => this.bundleUrl(kind, ids, categories),
                },
                happ,
                mode,
            );
        } catch (error) {
            if (error instanceof XrayGeofileFallback) throw error;
            throw new ClientPoolError(
                error instanceof Error ? error.message : 'geofile-configuration',
            );
        }
    }

    public async ingest(
        name: unknown,
        kindValue: unknown,
        read: () => Promise<Buffer>,
        origin: GeofileOrigin = 'upload',
    ): Promise<StoredGeofile> {
        if (
            typeof name !== 'string' ||
            !name.trim() ||
            name.length > 128 ||
            // eslint-disable-next-line no-control-regex -- Reject control bytes in library labels.
            /[\x00-\x1f\x7f]/.test(name) ||
            !GEOFILE_KINDS.includes(kindValue as GeofileKind)
        )
            throw new BadRequestException('geofile-name-or-kind');
        if (this.active >= 2) throw new ServiceUnavailableException('geofile-busy');
        this.active++;
        try {
            let data: Buffer;
            const kind = kindValue as GeofileKind;
            try {
                data = await read();
                validateGeofile(data, kind);
            } catch {
                throw new BadRequestException('geofile-invalid-or-unreachable');
            }
            const sha256 = createHash('sha256').update(data).digest('hex');
            // Share the existing cross-worker reference lock with deletion and template saves.
            return await this.withReferenceLock(async () => {
                await mkdir(this.root, { recursive: true, mode: 0o700 });
                const existing = (await this.list()).find(
                    (item) =>
                        item.sha256 === sha256 && item.kind === kind && item.origin === origin,
                );
                if (existing) return existing;
                // Atomic slot reservation bounds storage across API workers: 32 × 64 MiB.
                for (let slot = 0; slot < MAX_FILES; slot++) {
                    const directory = join(this.root, String(slot).padStart(2, '0'));
                    try {
                        await mkdir(directory, { mode: 0o700 });
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
                        throw error;
                    }
                    const id = slot.toString(16).padStart(2, '0') + randomBytes(16).toString('hex');
                    const filename = `${sha256}.${GEOFILE_EXTENSIONS[kind]}`;
                    const item: StoredGeofile = {
                        id,
                        name: name.trim(),
                        kind,
                        size: data.length,
                        sha256,
                        filename,
                        createdAt: new Date().toISOString(),
                        ...geofileProvenance(origin),
                        url: this.base + id + '/' + filename,
                        ...(['geoip', 'geosite'].includes(kind)
                            ? { categories: datCategories(data).slice(0, 1000) }
                            : {}),
                    };
                    try {
                        await writeFile(join(directory, 'data'), data, { flag: 'wx', mode: 0o600 });
                        await writeFile(join(directory, 'meta.tmp'), JSON.stringify(item), {
                            flag: 'wx',
                            mode: 0o600,
                        });
                        // Readers see either an uncommitted slot or complete metadata across workers.
                        await rename(join(directory, 'meta.tmp'), join(directory, 'meta.json'));
                        return item;
                    } catch (error) {
                        await rm(directory, { recursive: true, force: true });
                        throw error;
                    }
                }
                throw new ConflictException('geofile-storage-full');
            });
        } finally {
            this.active--;
        }
    }

    public async importUrl(name: unknown, kind: unknown, url: unknown): Promise<StoredGeofile> {
        if (typeof url !== 'string') throw new BadRequestException('geofile-url');
        const file = await this.ingest(
            name,
            kind,
            () => downloadGeofile(url),
            geofileProvenance(undefined, url).origin,
        );
        await this.refreshStore.configure(file.id, { sourceUrl: url, enabled: false }, true);
        return this.activeFile(await this.fileById(file.id));
    }

    public async remove(id: string): Promise<void> {
        await this.withReferenceLock(async () => {
            const directory = this.directory(id);
            const item = await this.metadata(directory).catch(() => {
                throw new NotFoundException('Geofile not found');
            });
            if (item.id !== id) throw new NotFoundException('Geofile not found');
            const templates = await this.repository.getAllTemplates(true);
            if (
                templates.some(
                    (template) =>
                        (JSON.stringify(template.templateJson) ?? '').includes(id) ||
                        template.templateYaml?.includes(id),
                )
            )
                throw new ConflictException('geofile-in-use');
            // The directory is derived exclusively from a validated, bounded slot ID.
            await rm(directory, { recursive: true });
            this.compiled.clear();
        });
    }

    public async download(id: string, filename: string) {
        const directory = this.directory(id);
        let item = await this.metadata(directory).catch(() => {
            throw new NotFoundException('Geofile not found');
        });
        const latest = filename === `latest.${GEOFILE_EXTENSIONS[item.kind]}`;
        if (item.id !== id || (!latest && item.filename !== filename))
            throw new NotFoundException('Geofile not found');
        if (latest) item = this.activeFile(item);
        const file = await open(
            join(directory, latest && item.refresh?.current ? `current-${item.sha256}` : 'data'),
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        const info = await file.stat();
        if (!info.isFile() || info.size !== item.size || info.size > MAX_GEOFILE_BYTES) {
            await file.close();
            throw new NotFoundException('Geofile not found');
        }
        return { item, stream: file.createReadStream({ autoClose: true }) };
    }
}

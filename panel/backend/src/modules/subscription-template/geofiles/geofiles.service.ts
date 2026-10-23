import { load } from 'js-yaml';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, lstat, rm, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { PrismaService } from '@common/database/prisma.service';

import { ClientPoolError } from '../generators/client-pool';
import { SubscriptionTemplateRepository } from '../repositories/subscription-template.repository';
import { bundleDat } from './bundle-dat';
import { compileDat, datCategories, DatRules } from './compile-dat';
import { downloadGeofile, MAX_GEOFILE_BYTES } from './download-geofile';
import { datClientFile } from './geofile-delivery';
import { materializeGeofiles } from './materialize-geofiles';
import { GeofileRefreshState, GeofileRefreshStore, readGeofileRefresh } from './refresh-geofile';
import {
    GEOFILE_EXTENSIONS,
    GEOFILE_KINDS,
    GeofileKind,
    validateGeofile,
} from './validate-geofile';
import { DatKind, XrayGeofileDelivery, XrayGeofileFallback } from './xray-geofile-delivery';

const MAX_FILES = 32;
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
    private readonly bundled = new Map<string, Buffer>();
    private bundling = 0;
    private readonly base: string;
    private readonly secret: string;
    private readonly refreshStore: GeofileRefreshStore;
    constructor(
        config: TypedConfigService,
        private readonly repository: SubscriptionTemplateRepository,
        private readonly prisma: PrismaService,
    ) {
        this.base = `https://${config.getOrThrow('SUB_PUBLIC_DOMAIN')}/geofiles/`;
        this.secret = config.getOrThrow('APP_SECRET');
        this.refreshStore = new GeofileRefreshStore({
            directory: (id) => this.directory(id),
            file: (id) => this.fileById(id),
            list: () => this.list(),
            lock: (operation) => this.withReferenceLock(operation),
            validate: async (file, data) => {
                if (!['geoip', 'geosite'].includes(file.kind)) return;
                const selections = new Set<string>();
                let nativeXray = false;
                for (const template of await this.repository.getAllTemplates(true)) {
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
                                reference.downloadToClient === true
                            )
                                nativeXray = true;
                            selections.add(
                                JSON.stringify({
                                    categories: reference.categories ?? [],
                                    format: template.templateType,
                                }),
                            );
                        }
                }
                for (const selection of selections) {
                    const { categories, format } = JSON.parse(selection),
                        rules = compileDat(data, file.kind as 'geoip' | 'geosite', categories);
                    if (['SINGBOX', 'MIHOMO', 'CLASH', 'STASH'].includes(format))
                        datClientFile(rules, format);
                }
                if (nativeXray) bundleDat([{ id: file.id, data }]);
            },
        });
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
        const handle = await open(
            join(
                this.directory(file.id),
                file.refresh?.current ? `current-${file.sha256}` : 'data',
            ),
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
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

    private async bundleContent(kind: DatKind, ids: string[]): Promise<Buffer> {
        if (
            !['geoip', 'geosite'].includes(kind) ||
            !Array.isArray(ids) ||
            !ids.length ||
            ids.length > MAX_FILES ||
            ids.some((id) => typeof id !== 'string' || !ID.test(id)) ||
            new Set(ids).size !== ids.length
        )
            throw new Error('geofile-bundle');
        const files = [];
        let bytes = 0;
        for (const id of ids) {
            const file = this.activeFile(await this.fileById(id));
            if (file.kind !== kind || (bytes += file.size) > MAX_GEOFILE_BYTES)
                throw new Error('geofile-bundle');
            files.push(file);
        }
        const key = files.map((file) => `${file.id}:${file.sha256}`).join(',');
        const cached = this.bundled.get(key);
        if (cached) return cached;
        if (this.bundling >= 2) throw new ServiceUnavailableException('geofile-busy');
        this.bundling++;
        try {
            const sources = [];
            for (const file of files)
                sources.push({ id: file.id, data: await this.readActive(file) });
            const data = bundleDat(sources);
            if (data.length <= 32 * 1024 * 1024) {
                while (
                    this.bundled.size &&
                    (this.bundled.size >= 2 ||
                        [...this.bundled.values()].reduce((sum, value) => sum + value.length, 0) +
                            data.length >
                            32 * 1024 * 1024)
                )
                    this.bundled.delete(this.bundled.keys().next().value!);
                this.bundled.set(key, data);
            }
            return data;
        } finally {
            this.bundling--;
        }
    }

    private async bundleUrl(kind: DatKind, ids: string[]): Promise<string> {
        const ordered = [...ids].sort();
        await this.bundleContent(kind, ordered);
        const payload = Buffer.from(JSON.stringify({ kind, ids: ordered })).toString('base64url');
        if (payload.length > 2732) throw new Error('geofile-bundle-size');
        return `${this.base}${ordered[0]}/bundle-${this.bundleSignature(ordered[0], payload)}.dat?selection=${payload}`;
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
            const raw = Buffer.from(selection, 'base64url');
            if (raw.length > 2048 || raw.toString('base64url') !== selection)
                throw new Error('geofile-bundle');
            const { kind, ids } = JSON.parse(raw.toString('utf8'));
            if (!Array.isArray(ids) || ids[0] !== id) throw new Error('geofile-bundle');
            const data = await this.bundleContent(kind, ids);
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

    private async compile(file: StoredGeofile, categories: string[]): Promise<DatRules> {
        const key = file.id + ':' + file.sha256 + ':' + JSON.stringify(categories),
            cached = this.compiled.get(key);
        if (cached) return cached;
        if (this.compiling >= 2) throw new ServiceUnavailableException('geofile-busy');
        this.compiling++;
        try {
            const rules = compileDat(
                await this.readActive(file),
                file.kind as 'geoip' | 'geosite',
                categories,
            );
            if (this.compiled.size >= 32) this.compiled.delete(this.compiled.keys().next().value!);
            this.compiled.set(key, rules);
            return rules;
        } finally {
            this.compiling--;
        }
    }

    public async configureRefresh(
        id: string,
        options: { sourceUrl?: unknown; enabled?: unknown; intervalSeconds?: unknown },
    ) {
        try {
            await this.refreshStore.configure(id, options);
            return await this.fileById(id);
        } catch {
            throw new BadRequestException('geofile-refresh-settings');
        }
    }
    public async refreshNow(id: string) {
        return this.refreshStore.refresh(id, true);
    }
    public async refreshDue() {
        return this.refreshStore.refreshDue();
    }

    public async list(): Promise<StoredGeofile[]> {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        const result: StoredGeofile[] = [];
        for (let slot = 0; slot < MAX_FILES; slot++) {
            try {
                result.push(await this.metadata(join(this.root, String(slot).padStart(2, '0'))));
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
    ): Promise<Record<string, unknown>> {
        try {
            return await materializeGeofiles(
                config,
                type,
                async (id) => this.activeFile(await this.fileById(id)),
                (file, categories) => this.compile(file, categories),
                {
                    read: (file) => this.readActive(file),
                    datUrl: (file, categories, format) => this.derivedUrl(file, categories, format),
                    datBundleUrl: (kind, ids) => this.bundleUrl(kind, ids),
                },
                happ,
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
                    (item) => item.sha256 === sha256 && item.kind === kind,
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
        const file = await this.ingest(name, kind, () => downloadGeofile(url));
        await this.refreshStore.configure(file.id, { sourceUrl: url, enabled: false }, true);
        return this.fileById(file.id);
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

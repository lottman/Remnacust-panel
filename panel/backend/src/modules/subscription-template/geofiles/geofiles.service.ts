import { createHash, randomBytes } from 'node:crypto';
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
import { compileDat, datCategories, DatRules } from './compile-dat';
import { downloadGeofile, MAX_GEOFILE_BYTES } from './download-geofile';
import { materializeGeofiles } from './materialize-geofiles';
import {
    GEOFILE_EXTENSIONS,
    GEOFILE_KINDS,
    GeofileKind,
    validateGeofile,
} from './validate-geofile';

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
    private readonly base: string;
    constructor(
        config: TypedConfigService,
        private readonly repository: SubscriptionTemplateRepository,
        private readonly prisma: PrismaService,
    ) {
        this.base = `https://${config.getOrThrow('SUB_PUBLIC_DOMAIN')}/geofiles/`;
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
        return { ...item, url: this.base + item.id + '/' + item.filename };
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
            const match = /^([a-f0-9]{34})\/([a-f0-9]{64}\.[a-z]+)/.exec(suffix);
            if (!match || !files.some((file) => file.id === match[1] && file.filename === match[2]))
                throw new BadRequestException('geofile-reference');
        }
    }

    public async prepare(
        config: Record<string, unknown>,
        type: string,
    ): Promise<Record<string, unknown>> {
        try {
            return await materializeGeofiles(
                config,
                type,
                async (id) => {
                    const file = await this.metadata(this.directory(id));
                    if (file.id !== id) throw new Error('geofile-not-found');
                    return file;
                },
                async (file, categories) => {
                    const key = file.id + ':' + JSON.stringify(categories);
                    const cached = this.compiled.get(key);
                    if (cached) return cached;
                    if (this.compiling >= 2) throw new Error('geofile-busy');
                    this.compiling++;
                    try {
                        const opened = await this.download(file.id, file.filename);
                        const chunks: Buffer[] = [];
                        for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk));
                        const data = Buffer.concat(chunks);
                        if (createHash('sha256').update(data).digest('hex') !== file.sha256)
                            throw new Error('geofile-integrity');
                        const rules = compileDat(
                            data,
                            file.kind as 'geoip' | 'geosite',
                            categories,
                        );
                        if (this.compiled.size >= 8)
                            this.compiled.delete(this.compiled.keys().next().value!);
                        this.compiled.set(key, rules);
                        return rules;
                    } finally {
                        this.compiling--;
                    }
                },
            );
        } catch (error) {
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
        } finally {
            this.active--;
        }
    }

    public async importUrl(name: unknown, kind: unknown, url: unknown): Promise<StoredGeofile> {
        if (typeof url !== 'string') throw new BadRequestException('geofile-url');
        return this.ingest(name, kind, () => downloadGeofile(url));
    }

    public async remove(id: string): Promise<void> {
        await this.withReferenceLock(async () => {
            const directory = this.directory(id);
            const item = await this.metadata(directory).catch(() => {
                throw new NotFoundException('Geofile not found');
            });
            if (item.id !== id) throw new NotFoundException('Geofile not found');
            const templates = await this.repository.getAllTemplates(false);
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
        const item = await this.metadata(directory).catch(() => {
            throw new NotFoundException('Geofile not found');
        });
        if (item.id !== id || item.filename !== filename)
            throw new NotFoundException('Geofile not found');
        const file = await open(
            join(directory, 'data'),
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

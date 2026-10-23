import type { StoredGeofile } from './geofiles.service';

import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { datCategories } from './compile-dat';
import { downloadGeofile, geofileUrl, MAX_GEOFILE_BYTES } from './download-geofile';
import { DEFAULT_GEOFILE_INTERVAL, geofileInterval } from './geofile-delivery';
import { validateGeofile } from './validate-geofile';

export interface GeofileRefreshState {
    sourceUrl: string;
    enabled: boolean;
    intervalSeconds: number;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    nextRefreshAt?: string;
    lastError?: string;
    lease?: { token: string; until: string };
    current?: { sha256: string; size: number; categories?: string[]; updatedAt: string };
    previousSha256?: string;
}

export async function readGeofileRefresh(
    directory: string,
): Promise<GeofileRefreshState | undefined> {
    let handle;
    try {
        handle = await open(
            join(directory, 'refresh.json'),
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 256 * 1024) throw Error('geofile-refresh-state');
        const state = JSON.parse(await handle.readFile('utf8')) as GeofileRefreshState;
        geofileUrl(state.sourceUrl);
        geofileInterval(state.intervalSeconds, 900);
        if (typeof state.enabled !== 'boolean') throw Error('geofile-refresh-state');
        if (
            state.current &&
            (!/^[a-f0-9]{64}$/.test(state.current.sha256) ||
                !Number.isSafeInteger(state.current.size) ||
                state.current.size < 1 ||
                state.current.size > MAX_GEOFILE_BYTES)
        )
            throw Error('geofile-refresh-state');
        if (state.previousSha256 && !/^[a-f0-9]{64}$/.test(state.previousSha256))
            throw Error('geofile-refresh-state');
        for (const value of [
            state.lastAttemptAt,
            state.lastSuccessAt,
            state.nextRefreshAt,
            state.lease?.until,
        ])
            if (value !== undefined && !Number.isFinite(Date.parse(value)))
                throw Error('geofile-refresh-state');
        return state;
    } finally {
        await handle.close();
    }
}

async function writeState(directory: string, state: GeofileRefreshState) {
    const temporary = join(directory, `refresh-${randomBytes(16).toString('hex')}.tmp`);
    try {
        await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(directory, 'refresh.json'));
    } finally {
        await rm(temporary, { force: true });
    }
}

async function cleanupStaging(directory: string, state: GeofileRefreshState) {
    const retained = new Set([state.current?.sha256, state.previousSha256].filter(Boolean));
    for (const name of await readdir(directory)) {
        const current = /^current-([a-f0-9]{64})$/.exec(name);
        if (
            (current && !retained.has(current[1])) ||
            /^(download|refresh)-[a-f0-9]{32}\.tmp$/.test(name)
        )
            await rm(join(directory, name), { force: true });
    }
}

export class GeofileRefreshStore {
    private active = 0;
    constructor(
        private readonly dependencies: {
            directory: (id: string) => string;
            file: (id: string) => Promise<StoredGeofile>;
            list: () => Promise<StoredGeofile[]>;
            lock: <T>(operation: () => Promise<T>) => Promise<T>;
            validate: (file: StoredGeofile, data: Buffer) => Promise<void>;
        },
    ) {}

    async configure(
        id: string,
        options: { sourceUrl?: unknown; enabled?: unknown; intervalSeconds?: unknown },
        onlyIfMissing = false,
    ) {
        return this.dependencies.lock(async () => {
            await this.dependencies.file(id);
            const directory = this.dependencies.directory(id),
                old = await readGeofileRefresh(directory);
            if (onlyIfMissing && old) return;
            const source = options.sourceUrl ?? old?.sourceUrl;
            if (typeof source !== 'string') throw Error('geofile-refresh-source-required');
            const sourceUrl = geofileUrl(source).href;
            const enabled = options.enabled ?? old?.enabled ?? false;
            if (typeof enabled !== 'boolean') throw Error('geofile-refresh-enabled');
            const intervalSeconds = geofileInterval(
                options.intervalSeconds ?? old?.intervalSeconds ?? DEFAULT_GEOFILE_INTERVAL,
                900,
            );
            const state: GeofileRefreshState = { ...old, sourceUrl, enabled, intervalSeconds };
            if (onlyIfMissing) {
                state.lastAttemptAt = new Date().toISOString();
                state.lastSuccessAt = state.lastAttemptAt;
                state.nextRefreshAt = new Date(Date.now() + intervalSeconds * 1000).toISOString();
            }
            if (old?.lastAttemptAt)
                state.nextRefreshAt = new Date(
                    Date.parse(old.lastAttemptAt) + intervalSeconds * 1000,
                ).toISOString();
            await writeState(directory, state);
        });
    }

    async refresh(id: string, manual = false): Promise<boolean> {
        if (this.active >= 2) return false;
        this.active++;
        try {
            return await this.performRefresh(id, manual);
        } finally {
            this.active--;
        }
    }

    private async performRefresh(id: string, manual: boolean): Promise<boolean> {
        const claim = await this.dependencies.lock(async () => {
            const file = await this.dependencies.file(id),
                directory = this.dependencies.directory(id),
                state = await readGeofileRefresh(directory),
                now = Date.now();
            if (!state || (!manual && !state.enabled)) return;
            if (
                (state.lease && Date.parse(state.lease.until) > now) ||
                (state.nextRefreshAt && Date.parse(state.nextRefreshAt) > now)
            )
                return;
            await cleanupStaging(directory, state);
            const token = randomBytes(16).toString('hex');
            await writeState(directory, {
                ...state,
                lastAttemptAt: new Date(now).toISOString(),
                nextRefreshAt: new Date(now + state.intervalSeconds * 1000).toISOString(),
                lease: { token, until: new Date(now + 90000).toISOString() },
            });
            return { file, directory, sourceUrl: state.sourceUrl, token };
        });
        if (!claim) return false;
        try {
            const data = await downloadGeofile(claim.sourceUrl);
            validateGeofile(data, claim.file.kind);
            const sha256 = createHash('sha256').update(data).digest('hex');
            const committed = await this.dependencies.lock(async () => {
                // Deletion/replacement while the download was in progress must not recreate a slot.
                const file = await this.dependencies.file(id),
                    state = await readGeofileRefresh(claim.directory);
                if (
                    file.id !== id ||
                    state?.lease?.token !== claim.token ||
                    state.sourceUrl !== claim.sourceUrl
                )
                    return false;
                const now = new Date().toISOString(),
                    old = state.current;
                if (sha256 !== (old?.sha256 ?? file.sha256)) {
                    await this.dependencies.validate(file, data);
                    const temporary = join(claim.directory, `download-${claim.token}.tmp`);
                    try {
                        await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
                        await rename(temporary, join(claim.directory, `current-${sha256}`));
                    } finally {
                        await rm(temporary, { force: true });
                    }
                    state.current = {
                        sha256,
                        size: data.length,
                        updatedAt: now,
                        ...(['geoip', 'geosite'].includes(file.kind)
                            ? { categories: datCategories(data).slice(0, 1000) }
                            : {}),
                    };
                    const obsolete = state.previousSha256;
                    state.previousSha256 = old?.sha256;
                    delete state.lease;
                    delete state.lastError;
                    state.lastSuccessAt = now;
                    await writeState(claim.directory, state);
                    if (obsolete && obsolete !== sha256 && obsolete !== state.previousSha256)
                        await rm(join(claim.directory, `current-${obsolete}`), { force: true });
                } else {
                    delete state.lease;
                    delete state.lastError;
                    state.lastSuccessAt = now;
                    await writeState(claim.directory, state);
                }
                return true;
            });
            return committed;
        } catch {
            await this.dependencies.lock(async () => {
                try {
                    await this.dependencies.file(id);
                    const state = await readGeofileRefresh(claim.directory);
                    if (state?.lease?.token !== claim.token) return;
                    delete state.lease;
                    state.lastError = 'geofile-refresh-failed';
                    await cleanupStaging(claim.directory, state);
                    await writeState(claim.directory, state);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
                    throw error;
                }
            });
            return false;
        }
    }

    async refreshDue() {
        const due = (await this.dependencies.list())
            .filter(
                (file) =>
                    file.refresh?.enabled &&
                    (!file.refresh.nextRefreshAt ||
                        Date.parse(file.refresh.nextRefreshAt) <= Date.now()),
            )
            .slice(0, 4);
        // Downloads run outside the cross-process metadata lock and remain bounded.
        for (let index = 0; index < due.length; index += 2)
            await Promise.all(due.slice(index, index + 2).map((file) => this.refresh(file.id)));
    }
}

import { InjectRedis } from '@songkeys/nestjs-redis';
import Redis, { ChainableCommander, ScanStream } from 'ioredis';

import { Injectable, Logger } from '@nestjs/common';

import { MemoryCacheService } from './memory-cache.service';
import { NODE_INCIDENT_SCRIPT, ACK_NODE_INCIDENT_SCRIPT } from './node-incident';

@Injectable()
export class RawCacheService {
    private readonly logger = new Logger(RawCacheService.name);

    constructor(
        @InjectRedis() private readonly redis: Redis,
        private readonly memoryCacheService: MemoryCacheService,
    ) {}

    async observeNodeIncident(
        uuid: string,
        observedAt: number,
        healthy: boolean,
        muted: boolean,
        previouslyConnected: boolean,
    ): Promise<number> {
        if (!/^[a-f0-9-]{36}$/i.test(uuid) || !Number.isSafeInteger(observedAt) || observedAt < 0)
            throw new Error('Invalid node observation');
        const result = await this.redis.eval(
            NODE_INCIDENT_SCRIPT,
            1,
            `remnacust:node-incident:v1:${uuid}`,
            observedAt,
            healthy ? 1 : 0,
            muted ? 1 : 0,
            previouslyConnected ? 1 : 0,
            Date.now(),
        );
        if (![0, 1, 2].includes(Number(result))) throw new Error('Invalid incident transition');
        return Number(result);
    }

    async acknowledgeNodeIncident(uuid: string, observedAt: number, event: number): Promise<void> {
        if (
            !/^[a-f0-9-]{36}$/i.test(uuid) ||
            !Number.isSafeInteger(observedAt) ||
            ![1, 2].includes(event)
        )
            throw new Error('Invalid incident acknowledgement');
        await this.redis.eval(
            ACK_NODE_INCIDENT_SCRIPT,
            1,
            `remnacust:node-incident:v1:${uuid}`,
            observedAt,
            event,
        );
    }

    async get<T>(key: string, memCache: boolean = false): Promise<T | null> {
        if (memCache) {
            const hit = this.memoryCacheService.get<T>(key);
            if (hit !== undefined) return hit;
        }

        const raw = await this.redis.get(key);
        const parsed = raw ? (JSON.parse(raw) as T) : null;

        if (memCache && parsed !== null) {
            this.memoryCacheService.set(key, parsed as object);
        }

        return parsed;
    }

    async mget<T>(keys: string[]): Promise<(T | null)[]> {
        if (keys.length === 0) return [];
        const raws = await this.redis.mget(...keys);
        return raws.map((raw) => (raw ? JSON.parse(raw) : null));
    }

    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
        const raw = JSON.stringify(value);
        if (ttlSeconds) {
            await this.redis.set(key, raw, 'EX', ttlSeconds);
        } else {
            await this.redis.set(key, raw);
        }
    }

    async setString(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redis.set(key, value, 'EX', ttlSeconds);
        } else {
            await this.redis.set(key, value);
        }
    }

    async getString(key: string, memCache: boolean = false): Promise<string | null> {
        if (memCache) {
            const hit = this.memoryCacheService.get<string>(key);
            if (hit !== undefined) return hit;
        }

        const raw = await this.redis.get(key);
        if (memCache && raw !== null) {
            this.memoryCacheService.set(key, raw);
        }

        return raw;
    }

    async getNumber(key: string): Promise<number> {
        const raw = await this.redis.get(key);
        return raw ? Number(raw) : 0;
    }

    async setNumber(key: string, value: number, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.redis.set(key, value, 'EX', ttlSeconds);
        } else {
            await this.redis.set(key, value);
        }
    }

    /** Atomic fixed-window counter; a failed Redis command must never allow a request. */
    async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
        if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
            throw new Error('Counter TTL must be a positive integer');
        }
        const value = await this.redis.eval(
            "local n = redis.call('INCR', KEYS[1]); if n == 1 or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n",
            1,
            key,
            ttlSeconds,
        );
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
            throw new Error('Invalid rate-limit counter response');
        }
        return value;
    }

    async getDelString(key: string): Promise<null | string> {
        return this.redis.getdel(key);
    }

    async getDel<T>(key: string): Promise<T | null> {
        const raw = await this.redis.getdel(key);
        return raw ? (JSON.parse(raw) as T) : null;
    }

    async del(key: string): Promise<void> {
        await this.redis.del(key);
        await this.memoryCacheService.invalidate(key);
    }

    async delMany(keys: string[]): Promise<void> {
        if (keys.length === 0) return;
        await this.redis.del(...keys);
        await this.memoryCacheService.invalidateMany(keys);
    }

    async hgetallParsed<T>(key: string): Promise<T | null> {
        const raw = await this.redis.hgetall(key);
        if (!Object.keys(raw).length) return null;
        const parsed: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(raw)) {
            try {
                parsed[field] = JSON.parse(value);
            } catch {
                parsed[field] = value;
            }
        }
        return parsed as T;
    }

    async hset(key: string, field: string, value: string): Promise<void> {
        await this.redis.hset(key, field, value);
    }

    async hsetJson(key: string, field: string, value: unknown): Promise<void> {
        await this.redis.hset(key, field, JSON.stringify(value));
    }

    async setMany(entries: { key: string; value: unknown; ttlSeconds?: number }[]): Promise<void> {
        const pipe = this.redis.pipeline();
        for (const { key, value, ttlSeconds } of entries) {
            const raw =
                typeof value === 'number' || typeof value === 'string'
                    ? value
                    : JSON.stringify(value);
            if (ttlSeconds) {
                pipe.set(key, raw, 'EX', ttlSeconds);
            } else {
                pipe.set(key, raw);
            }
        }
        await pipe.exec();
    }

    async setManyFenced(
        fenceKey: string,
        epoch: string,
        entries: { key: string; value: unknown; ttlSeconds?: number }[],
    ): Promise<boolean> {
        if (
            !/^[1-9][0-9]{0,18}$/.test(epoch) ||
            BigInt(epoch) > 9223372036854775807n ||
            entries.length > 256
        )
            throw new Error('Invalid cache delivery epoch');
        const args: string[] = [epoch];
        for (const entry of entries) {
            const ttl = entry.ttlSeconds ?? 0;
            if (!Number.isInteger(ttl) || ttl < 0 || ttl > 2147483647)
                throw new Error('Invalid cache TTL');
            const value =
                typeof entry.value === 'number' || typeof entry.value === 'string'
                    ? String(entry.value)
                    : JSON.stringify(entry.value);
            if (value === undefined) throw new Error('Invalid cache value');
            args.push(value, String(ttl));
        }
        // Compare canonical decimal strings, not Lua doubles: delivery epochs
        // remain exact above 2^53. A delayed worker cannot replace newer data.
        const applied = await this.redis.eval(
            `
            local old=redis.call('GET',KEYS[1])
            local epoch=ARGV[1]
            if old then
                if not string.match(old,'^[1-9][0-9]*$') then return redis.error_reply('Invalid cached delivery epoch') end
                if #old>#epoch or (#old==#epoch and old>epoch) then return 0 end
            end
            redis.call('SET',KEYS[1],epoch)
            for i=2,#KEYS do
                local value=ARGV[2+(i-2)*2]
                local ttl=ARGV[3+(i-2)*2]
                if ttl=='0' then redis.call('SET',KEYS[i],value)
                else redis.call('SET',KEYS[i],value,'EX',ttl) end
            end
            return 1`,
            1 + entries.length,
            fenceKey,
            ...entries.map((e) => e.key),
            ...args,
        );
        if (applied === 1) await this.memoryCacheService.invalidateMany(entries.map((e) => e.key));
        return applied === 1;
    }

    createPipeline(): ChainableCommander {
        return this.redis.pipeline();
    }

    hscanStream(key: string, options?: { count?: number; match?: string }): ScanStream {
        return this.redis.hscanStream(key, options);
    }

    async xaddTrimmed(
        key: string,
        maxLenApprox: number,
        fields: Record<string, string>,
    ): Promise<void> {
        await this.redis.xadd(
            key,
            'MAXLEN',
            '~',
            maxLenApprox,
            '*',
            ...Object.entries(fields).flat(),
        );
    }

    async xaddUsageReceiptOnce(
        key: string,
        maxLenApprox: number,
        fields: Record<string, string>,
        stream: string,
        sequence: string,
        batch: number,
    ): Promise<void> {
        // One bounded hash per node instance, one high-water mark per batch.
        // Decimal string comparison remains exact beyond Lua's 53-bit numbers.
        await this.redis.eval(
            `local old=redis.call('HGET',KEYS[2],ARGV[1])
            local next=ARGV[2]
            if old and (#old>#next or (#old==#next and old>=next)) then return 0 end
            local args={'MAXLEN','~',ARGV[3],'*'}
            for i=4,#ARGV do args[#args+1]=ARGV[i] end
            redis.call('XADD',KEYS[1],unpack(args))
            redis.call('HSET',KEYS[2],ARGV[1],next)
            return 1`,
            2,
            key,
            `xera:usage-export:${stream}`,
            String(batch),
            sequence,
            String(maxLenApprox),
            ...Object.entries(fields).flat(),
        );
    }

    async xaddTrimmedByAge(
        key: string,
        maxAgeMs: number,
        fields: Record<string, string>,
    ): Promise<void> {
        await this.redis.xadd(
            key,
            'MINID',
            '~',
            Date.now() - maxAgeMs,
            '*',
            ...Object.entries(fields).flat(),
        );
    }

    async exists(key: string): Promise<boolean> {
        return (await this.redis.exists(key)) === 1;
    }

    async ttl(key: string): Promise<number> {
        return this.redis.ttl(key);
    }

    async rename(oldKey: string, newKey: string): Promise<void> {
        await this.redis.rename(oldKey, newKey);
    }

    async cachedByKeys<TRow, TVal>(
        ids: string[],
        opts: {
            cacheKey: (id: string) => string;
            ttlSeconds: number;
            fetch: (missed: string[]) => Promise<TRow[]>;
            rowId: (row: TRow) => string;
            toValue: (row: TRow) => TVal;
        },
    ): Promise<Map<string, TVal>> {
        if (ids.length === 0) return new Map();

        let cached: ({ v: TVal } | null)[];
        try {
            cached = await this.mget<{ v: TVal }>(ids.map(opts.cacheKey));
        } catch (error) {
            this.logger.warn(
                `Configuration cache read failed: ${error instanceof Error ? error.name : 'unknown'}`,
            );
            cached = ids.map(() => null);
        }
        const result = new Map<string, TVal>();
        const missed: string[] = [];

        ids.forEach((id, i) => {
            const entry = cached[i];
            if (entry && typeof entry === 'object' && Object.hasOwn(entry, 'v'))
                result.set(id, entry.v);
            else missed.push(id);
        });

        if (missed.length) {
            const rows = await opts.fetch(missed);
            try {
                await this.setMany(
                    rows.map((r) => ({
                        key: opts.cacheKey(opts.rowId(r)),
                        value: { v: opts.toValue(r) },
                        ttlSeconds: opts.ttlSeconds,
                    })),
                );
            } catch (error) {
                this.logger.warn(
                    `Configuration cache write failed: ${error instanceof Error ? error.name : 'unknown'}`,
                );
            }
            rows.forEach((r) => result.set(opts.rowId(r), opts.toValue(r)));
        }
        return result;
    }

    publishSafe(channel: string, message: unknown): void {
        void this.redis
            .publish(channel, JSON.stringify(message))
            .catch((e) => this.logger.error(`publish ${channel} failed: ${e}`));
    }
}

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { RawCacheService } from '@common/raw-cache';
import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { GetHttpStatsResponseModel } from './models';

@Injectable()
export class RouteCounterService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(RouteCounterService.name);

    private static readonly REDIS_KEY = 'route_counter:stats';
    private static readonly FLUSH_INTERVAL_MS = 5_000;

    private readonly keys: string[] = [];
    private readonly counts: number[] = [];
    private readonly slotByKey = new Map<string, number>();

    private timer: NodeJS.Timeout | null = null;
    private isFlushing = false;

    constructor(private readonly rawCacheService: RawCacheService) {}

    public register(key: string): number {
        let slot = this.slotByKey.get(key);
        if (slot === undefined) {
            slot = this.keys.length;
            this.keys.push(key);
            this.counts.push(0);
            this.slotByKey.set(key, slot);
        }
        return slot;
    }

    public increment(slot: number): void {
        this.counts[slot]++;
    }

    public async getStats(): Promise<TResult<GetHttpStatsResponseModel>> {
        try {
            const hash = await this.rawCacheService.hgetallParsed<Record<string, number>>(
                RouteCounterService.REDIS_KEY,
            );

            if (!hash) {
                return ok(new GetHttpStatsResponseModel({ routes: [], total: 0 }));
            }

            let total = 0;
            const routes: Array<{ method: string; route: string; count: number }> = [];
            for (const [key, value] of Object.entries(hash)) {
                const count = Number(value);
                const spaceAt = key.indexOf(' ');
                const method = spaceAt === -1 ? '' : key.slice(0, spaceAt);
                const route = spaceAt === -1 ? key : key.slice(spaceAt + 1);
                routes.push({ method, route, count });
                total += count;
            }

            routes.sort((a, b) => b.count - a.count);

            return ok(new GetHttpStatsResponseModel({ routes, total }));
        } catch (error) {
            this.logger.error(`Failed to get HTTP stats: ${error}`);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public onApplicationBootstrap(): void {
        this.timer = setInterval(() => {
            void this.flush();
        }, RouteCounterService.FLUSH_INTERVAL_MS);
        this.timer.unref();
    }

    public async onModuleDestroy(): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async flush(): Promise<void> {
        if (this.isFlushing) return;
        this.isFlushing = true;

        const drained: Array<{ field: string; delta: number }> = [];
        for (let i = 0; i < this.counts.length; i++) {
            const delta = this.counts[i];
            if (delta > 0) {
                drained.push({ field: this.keys[i], delta });
                this.counts[i] = 0;
            }
        }

        if (drained.length === 0) {
            this.isFlushing = false;
            return;
        }

        try {
            const pipe = this.rawCacheService.createPipeline();
            for (const { field, delta } of drained) {
                pipe.hincrby(RouteCounterService.REDIS_KEY, field, delta);
            }
            await pipe.exec();
        } catch (error) {
            for (const { field, delta } of drained) {
                this.counts[this.slotByKey.get(field)!] += delta;
            }
            this.logger.error(`Failed to flush route counters, will retry next window: ${error}`);
        } finally {
            this.isFlushing = false;
        }
    }
}

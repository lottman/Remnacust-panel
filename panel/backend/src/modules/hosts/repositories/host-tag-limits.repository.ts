import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

export type HostTagLimit = {
    tag: string;
    limitBytes: bigint;
    speedLimitMbps: number | null;
    totalSpeedLimitMbps: number | null;
    trafficMultiplier: number;
    resetValue: number;
    resetUnit: 'DAYS' | 'MONTHS';
    resetAnchorAt: Date;
};
export type HostTagUsage = HostTagLimit & {
    usedBytes: bigint;
    ambiguous: boolean;
    paused: boolean;
};

@Injectable()
export class HostTagLimitsRepository {
    constructor(
        private readonly qb: TxKyselyService,
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    async list(): Promise<HostTagLimit[]> {
        const result = await this.prisma.tx.$queryRaw<HostTagLimit[]>`
            SELECT tag, total_speed_limit_mbps AS "totalSpeedLimitMbps",traffic_multiplier AS "trafficMultiplier", user_traffic_limit_bytes AS "limitBytes", speed_limit_mbps AS "speedLimitMbps",
                reset_value AS "resetValue", reset_unit AS "resetUnit",
                reset_anchor_at AS "resetAnchorAt"
            FROM xera_host_tag_limits ORDER BY tag
        `;
        return result;
    }

    async set(
        tag: string,
        limitBytes: bigint,
        resetValue: number,
        resetUnit: 'DAYS' | 'MONTHS',
        speedLimitMbps: number | null,
        totalSpeedLimitMbps: number | null,
        trafficMultiplier: number,
    ): Promise<void> {
        await this.prisma.tx.$executeRaw`
            INSERT INTO xera_host_tag_limits (tag, user_traffic_limit_bytes, speed_limit_mbps, reset_value, reset_unit, total_speed_limit_mbps,traffic_multiplier,reset_anchor_at)
            VALUES (${tag}, ${limitBytes}, ${speedLimitMbps}, ${resetValue}, ${resetUnit},${totalSpeedLimitMbps},${trafficMultiplier},
                date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
            ON CONFLICT (tag) DO UPDATE SET
                user_traffic_limit_bytes = excluded.user_traffic_limit_bytes,
                speed_limit_mbps = excluded.speed_limit_mbps,
                total_speed_limit_mbps=excluded.total_speed_limit_mbps,
                traffic_multiplier=excluded.traffic_multiplier,
                reset_value = excluded.reset_value,
                reset_unit = excluded.reset_unit,
                reset_anchor_at = CASE
                    WHEN xera_host_tag_limits.reset_value IS DISTINCT FROM excluded.reset_value
                      OR (excluded.reset_value > 0 AND xera_host_tag_limits.reset_unit IS DISTINCT FROM excluded.reset_unit)
                    THEN date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                    ELSE xera_host_tag_limits.reset_anchor_at
                END,
                updated_at = now()
        `;
    }

    async delete(tag: string): Promise<void> {
        await this.prisma.tx.$executeRaw`DELETE FROM xera_host_tag_limits WHERE tag = ${tag}`;
    }

    async usageForUser(userId: bigint): Promise<HostTagUsage[]> {
        const result = await sql<HostTagUsage>`
            SELECT l.total_speed_limit_mbps AS "totalSpeedLimitMbps",l.traffic_multiplier AS "trafficMultiplier",l.tag,q.effective_limit AS "limitBytes",l.speed_limit_mbps AS "speedLimitMbps",
              l.reset_value AS "resetValue",l.reset_unit AS "resetUnit",l.reset_anchor_at AS "resetAnchorAt",
              q.used_bytes AS "usedBytes",q.paused,false AS ambiguous
            FROM xera_host_tag_limits l CROSS JOIN LATERAL xera_limit_state('TAG',l.tag,${userId}) q
        `.execute(this.qb.kysely);
        return result.rows;
    }
}

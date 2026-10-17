import type { UsageNode } from './durable-usage.service';

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';

@Injectable()
export class UsageJournalService implements OnModuleDestroy {
    private readonly client: PrismaClient;

    constructor(config: TypedConfigService) {
        // A collector holds its main connection's advisory lock until billing
        // commits. Sharing that pool for the independent journal write can
        // deadlock every collector when the pool is full (even with one worker
        // and connection_limit=1). Keep one bounded, lazy pool for the journal.
        const url = new URL(config.getOrThrow('DATABASE_URL'));
        url.searchParams.set('connection_limit', '2');
        url.searchParams.set('pool_timeout', '10');
        this.client = new PrismaClient({ datasourceUrl: url.toString() });
    }

    async prepare(node: UsageNode): Promise<void> {
        await this.client
            .$executeRaw`INSERT INTO xera_legacy_usage_streams(stream_id,node_uuid,node_id,requested_at,consumption_multiplier)
            VALUES(${randomUUID()}::uuid,${node.nodeUuid}::uuid,${node.nodeId},clock_timestamp(),${node.multiplier}::bigint)
            ON CONFLICT(node_uuid) DO UPDATE SET requested_at=clock_timestamp(),consumption_multiplier=excluded.consumption_multiplier,updated_at=now()`;
    }

    async capture(node: UsageNode, snapshot: unknown): Promise<void> {
        await this.client
            .$executeRaw`UPDATE xera_legacy_usage_streams SET payload=${JSON.stringify(snapshot)}::jsonb,updated_at=now()
            WHERE node_uuid=${node.nodeUuid}::uuid`;
    }

    async markUncertain(node: UsageNode): Promise<void> {
        await this.client
            .$executeRaw`UPDATE xera_legacy_usage_streams SET uncertain_since=COALESCE(uncertain_since,requested_at),
            requested_at=NULL,consumption_multiplier=NULL,next_sequence=next_sequence+1,updated_at=now()
            WHERE node_uuid=${node.nodeUuid}::uuid`;
    }

    async onModuleDestroy(): Promise<void> {
        await this.client.$disconnect();
    }
}

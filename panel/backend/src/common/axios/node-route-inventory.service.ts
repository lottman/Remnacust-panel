import type { PrismaClient } from '@prisma/client';

import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config/typed-config.service';

import { createPrismaClient } from '../database/postgres-adapter';

@Injectable()
export class NodeRouteInventoryService implements OnModuleDestroy {
    private client?: PrismaClient;
    private pendingRevision?: Promise<string>;
    constructor(private readonly config: TypedConfigService) {}

    private getClient(): PrismaClient {
        if (!this.client) {
            const url = new URL(this.config.getOrThrow('DATABASE_URL'));
            url.searchParams.set('connection_limit', '1');
            url.searchParams.set('pool_timeout', '1');
            url.searchParams.set('connect_timeout', '1');
            url.searchParams.set('statement_timeout', '1500');
            url.searchParams.set('query_timeout', '1800');
            url.searchParams.set('application_name', 'remnacust-node-route-inventory');
            url.searchParams.set(
                'options',
                [url.searchParams.get('options'), '-c statement_timeout=1500']
                    .filter(Boolean)
                    .join(' '),
            );
            this.client = createPrismaClient(url.toString());
        }
        return this.client;
    }

    get nodes(): PrismaClient['nodes'] {
        return this.getClient().nodes;
    }

    readRevision(): Promise<string> {
        if (!this.pendingRevision)
            this.pendingRevision = Promise.resolve()
                .then(async () => {
                    const rows = await this.getClient().$queryRaw<
                        Array<{ revision: string }>
                    >`SELECT revision::text AS revision FROM public.xera_node_route_revision WHERE id = 1`;
                    if (
                        rows.length !== 1 ||
                        typeof rows[0].revision !== 'string' ||
                        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rows[0].revision)
                    )
                        throw new Error('Node route revision is unavailable');
                    return rows[0].revision;
                })
                .finally(() => {
                    this.pendingRevision = undefined;
                });
        return this.pendingRevision;
    }

    async onModuleDestroy(): Promise<void> {
        if (this.pendingRevision) await Promise.allSettled([this.pendingRevision]);
        await this.client?.$disconnect();
    }
}

import type { PrismaClient } from '@prisma/client';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { createPrismaClient } from '../database/postgres-adapter';

@Injectable()
export class NodeRouteInventoryService implements OnModuleDestroy {
    private client?: PrismaClient;
    constructor(private readonly config: TypedConfigService) {}

    get nodes(): PrismaClient['nodes'] {
        if (!this.client) {
            const url = new URL(this.config.getOrThrow('DATABASE_URL'));
            url.searchParams.set('connection_limit', '1');
            url.searchParams.set('pool_timeout', '10');
            this.client = createPrismaClient(url.toString());
        }
        return this.client.nodes;
    }

    async onModuleDestroy(): Promise<void> {
        await this.client?.$disconnect();
    }
}

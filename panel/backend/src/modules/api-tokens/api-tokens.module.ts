import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaModule } from '@common/database';

import { ApiTokensController } from './api-tokens.controllers';
import { ApiTokenConverter } from './api-tokens.converter';
import { ApiTokensService } from './api-tokens.service';
import { QUERIES } from './queries';
import { ApiTokensRepository } from './repositories/api-tokens.repository';
import { ScopeCatalogService } from './scope-catalog.service';

@Module({
    imports: [CqrsModule, PrismaModule, DiscoveryModule],
    controllers: [ApiTokensController],
    providers: [
        ApiTokensRepository,
        ApiTokenConverter,
        ApiTokensService,
        ScopeCatalogService,
        ...QUERIES,
    ],
})
export class ApiTokensModule {}

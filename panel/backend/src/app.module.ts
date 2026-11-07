import { HostPolicyModule } from '@common/host-policy/host-policy.module';
import { XrayModeModule } from '@common/xray-mode/xray-mode.module';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { FrontendModule } from '@common/frontend/frontend.module';
import { ClsModule } from 'nestjs-cls';

import { Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CommonConfigModule } from '@common/config/common-config/common-config.module';
import { PrismaModule } from '@common/database';
import { PrismaService } from '@common/database/prisma.service';
import { RawCacheModule } from '@common/raw-cache/raw-cache.module';
import { RuntimeMetricsModule } from '@common/runtime-metrics/runtime-metrics.module';
import { disableFrontend } from '@common/utils/startup-app/is-development';

import { IntegrationModules } from '@integration-modules/integration-modules';

import { RemnawaveModules } from '@modules/remnawave-backend.modules';

import { QueueModule } from '@queue/queue.module';

@Module({
    imports: [
        XrayModeModule,
        HostPolicyModule,
        RawCacheModule,
        CommonConfigModule,
        PrismaModule,
        ClsModule.forRoot({
            plugins: [
                new ClsPluginTransactional({
                    imports: [PrismaModule],
                    adapter: new TransactionalAdapterPrisma({
                        prismaInjectionToken: PrismaService,
                    }),
                }),
            ],
        }),
        EventEmitterModule.forRoot({
            wildcard: true,
            delimiter: '.',
        }),

        IntegrationModules,
        RemnawaveModules,
        ConditionalModule.registerWhen(
            FrontendModule,
            () => !disableFrontend(),
        ),

        QueueModule,
        RuntimeMetricsModule,
    ],
})
export class AppModule implements OnApplicationShutdown {
    private readonly logger = new Logger(AppModule.name);

    async onApplicationShutdown(signal?: string): Promise<void> {
        if (signal) {
            this.logger.log(`${signal} signal received, shutting down...`);
        }
    }
}

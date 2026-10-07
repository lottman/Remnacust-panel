import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { PrometheusReporterController } from './prometheus-reporter.controller';
import { BasicStrategy } from './strategies';

@Module({
    imports: [
        ConfigModule,
        PassportModule,
        PrometheusModule.registerAsync({
            inject: [],
            controller: PrometheusReporterController,
            useFactory: () => ({
                defaultMetrics: {
                    enabled: false,
                },
                defaultLabels: {
                    app: 'remnawave',
                },
                customMetricPrefix: 'remnawave',
            }),
        }),
    ],
    controllers: [],
    providers: [BasicStrategy],
    exports: [PrometheusModule],
})
export class PrometheusReporterModule {}

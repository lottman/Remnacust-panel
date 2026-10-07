import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

import { SubscriptionResponseRulesModule } from '@modules/subscription-response-rules/subscription-response-rules.module';

import { RouteCounterInterceptor } from './interceptors/route-counter.interceptor';
import { RouteCounterService } from './route-counter.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
    imports: [CqrsModule, SubscriptionResponseRulesModule],
    controllers: [SystemController],
    providers: [
        SystemService,
        RouteCounterService,
        {
            provide: APP_INTERCEPTOR,
            useClass: RouteCounterInterceptor,
        },
    ],
})
export class SystemModule {}

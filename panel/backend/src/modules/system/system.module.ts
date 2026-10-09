import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

import { SubscriptionResponseRulesModule } from '@modules/subscription-response-rules/subscription-response-rules.module';

import { PanelUpdateInterceptor } from './interceptors/panel-update.interceptor';
import { RouteCounterInterceptor } from './interceptors/route-counter.interceptor';
import { PanelUpdateController } from './panel-update.controller';
import { PanelUpdateService } from './panel-update.service';
import { RouteCounterService } from './route-counter.service';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
    imports: [CqrsModule, SubscriptionResponseRulesModule],
    controllers: [SystemController, PanelUpdateController],
    providers: [
        SystemService,
        RouteCounterService,
        PanelUpdateService,
        { provide: APP_INTERCEPTOR, useClass: PanelUpdateInterceptor },
        {
            provide: APP_INTERCEPTOR,
            useClass: RouteCounterInterceptor,
        },
    ],
})
export class SystemModule {}

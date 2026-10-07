import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { TEMPLATE_RENDERERS } from './generators';
import { QUERIES } from './queries';
import { RenderTemplatesService } from './render-templates.service';
import { SubscriptionTemplateRepository } from './repositories/subscription-template.repository';
import { ResolveProxyConfigService } from './resolve-proxy/resolve-proxy-config.service';
import { SubscriptionTemplateController } from './subscription-template.controller';
import { SubscriptionTemplateConverter } from './subscription-template.converter';
import { SubscriptionTemplateService } from './subscription-template.service';
@Module({
    imports: [CqrsModule],
    controllers: [SubscriptionTemplateController],
    providers: [
        SubscriptionTemplateService,
        SubscriptionTemplateRepository,
        SubscriptionTemplateConverter,
        ResolveProxyConfigService,
        ...TEMPLATE_RENDERERS,
        RenderTemplatesService,
        ...QUERIES,
    ],
    exports: [
        SubscriptionTemplateService,
        RenderTemplatesService,
        ...TEMPLATE_RENDERERS,
        ResolveProxyConfigService,
    ],
})
export class SubscriptionTemplateModule {}

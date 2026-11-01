import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { SubscriptionDomainsService } from './subscription-domains.service';

// A domain ID is a public routing selector, not a credential. This lookup
// exposes only its public CDN base: no origin, list, counts or account data.
@ApiExcludeController()
@Controller('sub/domains')
export class SubscriptionDomainGatewayController {
    constructor(private readonly domains: SubscriptionDomainsService) {}

    @Get(':uuid/resolve')
    @Header('Cache-Control', 'no-store')
    async resolve(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
        return { response: { uuid, publicBaseUrl: await this.domains.gatewayBase(uuid) } };
    }
}

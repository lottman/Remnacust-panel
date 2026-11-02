import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { SubscriptionDomainsService } from './subscription-domains.service';

// A domain ID is a public routing selector, not a credential. This lookup
// exposes public CDN routing metadata: no origin, list, counts or account data.
@ApiExcludeController()
@Controller('sub/domains')
export class SubscriptionDomainGatewayController {
    constructor(private readonly domains: SubscriptionDomainsService) {}

    @Get(':uuid/resolve')
    @Header('Cache-Control', 'no-store')
    async resolve(@Param('uuid', new ParseUUIDPipe()) uuid: string, @Query('version') version?: string) {
        if (version !== undefined && version !== '1' && version !== '2')
            throw new BadRequestException('INVALID_SUBSCRIPTION_DOMAIN_VERSION');
        const base = await this.domains.gatewayBase(uuid);
        return { response: { uuid, publicBaseUrl: version === '2' ? base : `${base}/cdn/${uuid}`, requestHeaderName: await this.domains.gatewayHeaderName(uuid) } };
    }
}

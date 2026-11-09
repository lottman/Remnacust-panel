import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    HttpCode,
    Header,
    Param,
    ParseUUIDPipe,
    Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { DomainAccessRequestSchema } from '../../common/utils/subscription-domain-access';
import { SubscriptionDomainsService } from './subscription-domains.service';

// A domain ID is a public routing selector, not a credential. This lookup
// exposes public CDN routing metadata: no origin, list, counts or account data.
@ApiExcludeController()
@Controller('sub/domains')
export class SubscriptionDomainGatewayController {
    constructor(private readonly domains: SubscriptionDomainsService) {}

    @Post('access')
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    async access(@Body() body: unknown) {
        const input = DomainAccessRequestSchema.safeParse(body);
        if (!input.success) throw new BadRequestException('INVALID_SUBSCRIPTION_DOMAIN_REQUEST');
        return { response: await this.domains.access(input.data) };
    }

    @Get(':uuid/resolve')
    @Header('Cache-Control', 'no-store')
    async resolve(
        @Param('uuid', new ParseUUIDPipe()) uuid: string,
        @Query('version') version?: string,
    ) {
        if (version !== undefined && version !== '1' && version !== '2')
            throw new BadRequestException('INVALID_SUBSCRIPTION_DOMAIN_VERSION');
        const base = await this.domains.gatewayBase(uuid);
        return {
            response: {
                uuid,
                publicBaseUrl: version === '2' ? base : `${base}/cdn/${uuid}`,
                requestHeaderName: await this.domains.gatewayHeaderName(uuid),
            },
        };
    }
}

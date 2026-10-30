import { Request, Response } from 'express';

import { Get, Controller, Res, Req, Param, Logger } from '@nestjs/common';

import {
    REQUEST_TEMPLATE_TYPE_VALUES,
    TRequestTemplateTypeKeys,
} from '@remnawave/backend-contract';

import { ClientIp } from '@common/decorators/get-ip';
import { ResolvedShortUuid } from '@common/decorators/get-resolved-short-uuid';
import { IsBrowser } from '@common/decorators/is-browser';

import { WebpageService } from '@modules/webpage/webpage.service';

import { SubscriptionService } from './subscription.service';

@Controller()
export class SubscriptionController {
    private readonly logger = new Logger(SubscriptionController.name);

    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly webpageService: WebpageService,
    ) {}

    @Get([':shortUuid/device/:token', ':shortUuid/device/:token/:clientType'])
    async personal(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
        @Param('token') token: string,
        @Param('clientType') clientType?: string,
    ) {
        response.set('Cache-Control', 'private, no-store');
        response.set('Referrer-Policy', 'no-referrer');
        if (
            !/^[A-Za-z0-9_-]{8,64}$/.test(shortUuid) ||
            !/^[A-Za-z0-9_-]{14,86}\.[A-Za-z0-9_-]{43}$/.test(token) ||
            (clientType &&
                !REQUEST_TEMPLATE_TYPE_VALUES.includes(clientType as TRequestTemplateTypeKeys))
        ) {
            return response.status(404).send('Subscription not found');
        }
        // Only the panel verifies device signatures and current revocation.
        // A browser must not turn this credential URL into an HTML account page.
        return this.subscriptionService.serveSubscriptionPage(
            clientIp,
            request,
            response,
            shortUuid,
            clientType as TRequestTemplateTypeKeys | undefined,
            token,
        );
    }

    @Get([':shortUuid', ':shortUuid/:clientType'])
    async root(
        @ClientIp() clientIp: string,
        @ResolvedShortUuid() resolvedShortUuid: string | undefined | null,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
        @Param('clientType') clientType: string,
        @IsBrowser() isBrowser: boolean,
    ) {
        if (isBrowser) {
            return this.webpageService.serveWebpage(
                clientIp,
                request,
                response,
                resolvedShortUuid ?? shortUuid,
            );
        }

        return this.subscriptionService.serveSubscriptionPage(
            clientIp,
            request,
            response,
            resolvedShortUuid ?? shortUuid,
            clientType ? (clientType as TRequestTemplateTypeKeys) : undefined,
        );
    }
}

import { Response } from 'express';

import { Controller, Get, HttpStatus, Param, Res, UseFilters } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Endpoint } from '@common/decorators/base-endpoint';
import { GetSrrContext } from '@common/decorators/get-srr-context';
import { HttpExceptionFilter } from '@common/exception/http-exception.filter';
import { PublicHttpExceptionFilter } from '@common/exception/public-http-exception.filter';
import { errorHandler } from '@common/helpers/error-handler.helper';
import {
    CONTROLLERS_INFO,
    SUBSCRIPTION_CONTROLLER,
    SUBSCRIPTION_ROUTES,
} from '@libs/contracts/api';
import { GetSubscriptionInfoByShortUuidCommand } from '@libs/contracts/commands';

import type { ISRRContext } from '@modules/subscription-response-rules/interfaces';
import { ResponseRulesEncryptionService } from '@modules/subscription-response-rules/services/response-rules-encryption.service';

import {
    GetSubscriptionByShortUuidByClientTypeParamDto,
    GetSubscriptionByShortUuidParamDto,
    GetSubscriptionInfoParamDto,
    GetSubscriptionInfoResponseDto,
} from '../dto';
import {
    SubscriptionNotFoundResponse,
    SubscriptionUnavailableResponse,
    SubscriptionRawResponse,
    SubscriptionWithConfigResponse,
} from '../models';
import { SubscriptionService } from '../subscription.service';
import { sendSubscriptionBody } from '../utils/send-subscription-body';

@ApiTags(CONTROLLERS_INFO.SUBSCRIPTION.tag)
@UseFilters(HttpExceptionFilter)
@Controller(SUBSCRIPTION_CONTROLLER)
export class SubscriptionController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly responseRulesEncryptionService: ResponseRulesEncryptionService,
    ) {}

    private async finalizeSubscriptionResponse(
        response: Response,
        srrContext: ISRRContext,
        result: SubscriptionWithConfigResponse,
    ): Promise<Response> {
        let body = result.body;
        let contentType = result.contentType;

        if (srrContext.encryption) {
            body = await this.responseRulesEncryptionService.encrypt(body, srrContext.encryption);
            contentType = 'text/plain';
        }

        response.set({
            ...result.headers,
            ...srrContext.headersToApply,
        });
        // Device blocks and host changes must be checked on every refresh.
        response.set('Cache-Control', 'private, no-store');

        return sendSubscriptionBody(response, body, contentType);
    }

    @Endpoint({
        command: GetSubscriptionInfoByShortUuidCommand,
        httpCode: HttpStatus.OK,
        type: GetSubscriptionInfoResponseDto,
    })
    async getSubscriptionInfoByShortUuid(
        @Param() param: GetSubscriptionInfoParamDto,
    ): Promise<GetSubscriptionInfoResponseDto> {
        const result = await this.subscriptionService.getSubscriptionInfo({
            searchBy: {
                uniqueField: param.shortUuid,
                uniqueFieldKey: 'shortUuid',
            },
            authenticated: false,
        });

        const data = errorHandler(result);
        return {
            response: data,
        };
    }

    @Get([SUBSCRIPTION_ROUTES.GET + '/:shortUuid'])
    async getSubscription(
        @GetSrrContext() srrContext: ISRRContext,
        @Param() param: GetSubscriptionByShortUuidParamDto,
        @Res() response: Response,
    ): Promise<Response> {
        const result = await this.subscriptionService.getSubscriptionByShortUuid(
            srrContext,
            param.shortUuid,
        );

        response.set('Cache-Control', 'private, no-store');

        if (result instanceof SubscriptionNotFoundResponse) {
            return response.status(404).send(result);
        }

        if (result instanceof SubscriptionUnavailableResponse) {
            return response
                .status(503)
                .set('Retry-After', '30')
                .set('Cache-Control', 'no-store')
                .send(result);
        }

        if (result instanceof SubscriptionRawResponse) {
            return response.status(200).send(result);
        }

        return this.finalizeSubscriptionResponse(response, srrContext, result);
    }

    @UseFilters(PublicHttpExceptionFilter)
    @Get([SUBSCRIPTION_ROUTES.GET + '/:shortUuid' + '/:clientType'])
    async getSubscriptionByClientType(
        @GetSrrContext() srrContext: ISRRContext,
        @Param() param: GetSubscriptionByShortUuidByClientTypeParamDto,
        @Res() response: Response,
    ): Promise<Response> {
        const result = await this.subscriptionService.getSubscriptionByShortUuid(
            srrContext,
            param.shortUuid,
        );

        response.set('Cache-Control', 'private, no-store');

        if (result instanceof SubscriptionNotFoundResponse) {
            return response.status(404).send(result);
        }

        if (result instanceof SubscriptionUnavailableResponse) {
            return response
                .status(503)
                .set('Retry-After', '30')
                .set('Cache-Control', 'no-store')
                .send(result);
        }

        if (result instanceof SubscriptionRawResponse) {
            return response.status(200).send(result);
        }

        return this.finalizeSubscriptionResponse(response, srrContext, result);
    }

    @UseFilters(PublicHttpExceptionFilter)
    @Get([SUBSCRIPTION_ROUTES.GET + '/:shortUuid/device/:token'])
    async getPersonalSubscription(
        @GetSrrContext() srrContext: ISRRContext,
        @Param('shortUuid') shortUuid: string,
        @Param('token') token: string,
        @Res() response: Response,
    ): Promise<Response> {
        const result = await this.subscriptionService.getSubscriptionByShortUuid(
            srrContext,
            shortUuid,
            token,
        );
        response.set('Cache-Control', 'private, no-store');
        if (result instanceof SubscriptionNotFoundResponse)
            return response.status(404).send(result);
        if (result instanceof SubscriptionUnavailableResponse)
            return response
                .status(503)
                .set('Retry-After', '30')
                .set('Cache-Control', 'no-store')
                .send(result);
        if (result instanceof SubscriptionRawResponse) return response.status(200).send(result);
        return this.finalizeSubscriptionResponse(response, srrContext, result);
    }
}

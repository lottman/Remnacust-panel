import { Request, Response } from 'express';

import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';

import { TRequestTemplateTypeKeys } from '@remnawave/backend-contract';

import { AxiosService } from '@common/axios/axios.service';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(private readonly axiosService: AxiosService) {}

    public async serveSubscriptionPage(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
        clientType?: TRequestTemplateTypeKeys,
    ): Promise<void> {
        const abort = new AbortController();
        const onClose = () => { if (!res.writableEnded) abort.abort(); };
        res.once('close', onClose);
        try {
            const subscriptionDataResponse = await this.axiosService.getSubscription(
                clientIp,
                shortUuid,
                req.headers,
                !!clientType,
                clientType,
                abort.signal,
            );

            if (!subscriptionDataResponse) {
                if (!res.destroyed) res.status(404).send('Subscription not found');
                return;
            }

            if (subscriptionDataResponse.headers) {
                res.set(subscriptionDataResponse.headers);
            }
            res.set('Cache-Control', 'private, no-store');
            res.set('Referrer-Policy', 'no-referrer');

            res.status(200).send(subscriptionDataResponse.subscription);
            return;
        } catch (error) {
            this.logger.error('Subscription delivery failed');

            if (!res.destroyed) {
                res.set('Cache-Control', 'private, no-store');
                res.set('Retry-After', '30');
                res.status(503).send('Subscription is temporarily unavailable');
            }
            return;
        } finally {
            res.off('close', onClose);
        }
    }
}

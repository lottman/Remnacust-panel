import { Request, Response, NextFunction } from 'express';

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';

import { REQUEST_TEMPLATE_TYPE_VALUES } from '@remnawave/backend-contract';

@Injectable()
export class ClientTypeMiddleware implements NestMiddleware {
    private readonly logger = new Logger(ClientTypeMiddleware.name);
    private readonly allowedClientTypes: ReadonlySet<string> = new Set(
        REQUEST_TEMPLATE_TYPE_VALUES,
    );

    use(req: Request, res: Response, next: NextFunction) {
        const clientType = req.params.clientType;

        if (clientType !== undefined && (typeof clientType !== 'string' || !this.allowedClientTypes.has(clientType))) {
            this.logger.warn('Invalid subscription client type');
            res.status(404).send('Subscription format not found');
            return;
        }

        next();
    }
}

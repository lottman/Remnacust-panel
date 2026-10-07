import { Request } from 'express';
import { Observable } from 'rxjs';

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';

import { isDevelopment } from '@common/utils/startup-app/is-development';

@Injectable()
export class ProxyCheckGuard implements CanActivate {
    private readonly logger = new Logger(ProxyCheckGuard.name);

    constructor(private readonly options: { exclude: string[] } = { exclude: [] }) {}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        if (isDevelopment()) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();

        if (this.options.exclude.includes(request.path)) {
            return true;
        }

        const isProxy = Boolean(request.headers['x-forwarded-for']);
        const isHttps = Boolean(request.headers['x-forwarded-proto'] === 'https');

        if (!isHttps || !isProxy) {
            this.logger.debug(
                `X-Forwarded-For: ${request.headers['x-forwarded-for']}, X-Forwarded-Proto: ${request.headers['x-forwarded-proto']}`,
            );

            const response = context.switchToHttp().getResponse();
            response.socket?.destroy();

            this.logger.error('Reverse proxy and HTTPS are required.');

            return false;
        }

        return true;
    }
}

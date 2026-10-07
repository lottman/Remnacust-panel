import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    ServiceUnavailableException,
} from '@nestjs/common';

import { RawCacheService } from '@common/raw-cache';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
    constructor(private readonly cache: RawCacheService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const createsPasskeyChallenge = /\/passkey\/authentication\/options\/?$/i.test(request.path ?? '');
        if (request.method !== 'POST' && !createsPasskeyChallenge) return true;
        const response = context.switchToHttp().getResponse<Response>();
        let globalCount: number;
        let identityCount: number;
        try {
            // This budget is independent of forwarded headers and shared by every API process.
            globalCount = await this.cache.incrementWithTtl('auth:requests:global', 60);
            const username: unknown = request.body?.username;
            const identity = typeof username === 'string'
                ? `username:${username.slice(0, 256).toLowerCase()}`
                : `peer:${request.socket.remoteAddress ?? 'unknown'}`;
            const digest = createHash('sha256').update(identity).digest('hex');
            identityCount = globalCount <= 120
                ? await this.cache.incrementWithTtl(`auth:requests:${digest}`, 60)
                : 16;
        } catch {
            throw new ServiceUnavailableException('Authentication is temporarily unavailable');
        }
        if (globalCount > 120 || identityCount > 15) {
            response.setHeader('Retry-After', '60');
            throw new HttpException('Too many authentication attempts', HttpStatus.TOO_MANY_REQUESTS);
        }
        return true;
    }
}

import { json, type Request, type RequestHandler } from 'express';

import {
    HttpException,
    InternalServerErrorException,
    Logger,
    PayloadTooLargeException,
} from '@nestjs/common';

import { hasRequestBody, rejectRequest } from './reject-request';

const inPath = (path: string, root: string) => path === root || path.startsWith(root + '/');
const logger = new Logger('PreParseAuth');

export function boundedJsonParser(
    authenticate: (request: Request) => Promise<void>,
): RequestHandler {
    const authParser = json({ limit: '64kb', inflate: false });
    const accessParser = json({ limit: '16kb', inflate: false });
    const authenticatedParser = json({ limit: '100mb', inflate: false });
    return async (request, response, next) => {
        if (!hasRequestBody(request)) return next();
        const path = request.path.toLowerCase();
        const access = path === '/api/sub/domains/access' || path === '/api/sub/domains/access/';
        if (inPath(path, '/api/sub') && !access) {
            return rejectRequest(
                request,
                response,
                new PayloadTooLargeException('Request body is not allowed'),
            );
        }
        if (inPath(path, '/api/auth')) return authParser(request, response, next);
        try {
            if (!inPath(path, '/api/backend-tools')) await authenticate(request);
        } catch (error) {
            if (!(error instanceof HttpException)) {
                const code = (error as { code?: unknown } | null)?.code;
                logger.error({
                    message: 'Request authentication failed before body parsing',
                    type: error instanceof Error ? error.name.slice(0, 64) : 'UnknownError',
                    ...(typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? { code } : {}),
                });
            }
            return rejectRequest(
                request,
                response,
                error instanceof HttpException ? error : new InternalServerErrorException(),
            );
        }
        return (access ? accessParser : authenticatedParser)(request, response, next);
    };
}

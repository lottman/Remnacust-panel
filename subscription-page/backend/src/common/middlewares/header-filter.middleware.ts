import { Request, Response, NextFunction } from 'express';

import { IGNORED_HEADERS } from '@common/constants';

export function headerFilterMiddleware(req: Request, _res: Response, next: NextFunction) {
    // The registered CDN selector is consumed by the following gateway middleware.
    // Host is retained for legacy links; neither is forwarded as panel authority.
    for (const key of Object.keys(req.headers)) {
        if (key !== 'accept-encoding' && key !== 'host' && key !== 'x-remnacust-cdn' && IGNORED_HEADERS.has(key)) {
            delete req.headers[key];
        }
    }

    if (!req.headers['user-agent']) {
        req.socket?.destroy();
        return;
    }

    next();
}

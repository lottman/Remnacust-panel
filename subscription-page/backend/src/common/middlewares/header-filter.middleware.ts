import { Request, Response, NextFunction } from 'express';

import { IGNORED_HEADERS } from '@common/constants';

export function headerFilterMiddleware(req: Request, _res: Response, next: NextFunction) {
    // Keep the request authority for same-origin geofile delivery. The upstream
    // request filter still strips Host before sending to the configured panel.
    for (const key of Object.keys(req.headers)) {
        if (key !== 'accept-encoding' && key !== 'host' && IGNORED_HEADERS.has(key)) {
            delete req.headers[key];
        }
    }

    if (!req.headers['user-agent']) {
        req.socket?.destroy();
        return;
    }

    next();
}

import type { Request, Response, NextFunction } from 'express';

import { withGeofileOrigin } from '../utils/geofile-request-context';

// The path is a public selector, not a credential. Existing subscription, HWID
// and geofile handlers still perform their normal checks after normalization.
export function subscriptionDomainGateway(resolve: (uuid: string) => Promise<string>) {
    const prefix = '/api/sub/cdn/';
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.url.startsWith(prefix)) return next();
        res.set('Cache-Control', 'private, no-store');
        const match = /^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})(\/[^?#]*)(\?[^#]*)?$/.exec(
            req.url.slice(prefix.length),
        );
        if (
            !match ||
            !['GET', 'HEAD'].includes(req.method) ||
            match[2].includes('/cdn/') ||
            /[%\\]/.test(match[2]) ||
            match[2].split('/').some((part) => part === '.' || part === '..') ||
            match[2].startsWith('//')
        )
            return res.status(404).end();
        try {
            const base = await resolve(match[1]);
            if (res.destroyed || res.writableEnded) return;
            req.url = '/api/sub' + match[2] + (match[3] ?? '');
            return withGeofileOrigin(base, next);
        } catch {
            return res.status(404).end();
        }
    };
}

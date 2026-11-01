import type { Request, Response, NextFunction } from 'express';

import { withGeofileOrigin } from '../utils/geofile-request-context';

// The path is a public selector, not a credential. Existing subscription, HWID
// and geofile handlers still perform their normal checks after normalization.
export function subscriptionDomainGateway(resolve: (uuid: string) => Promise<string>) {
    const prefix = '/api/sub/cdn/';
    return async (req: Request, res: Response, next: NextFunction) => {
        const selector = req.headers?.['x-remnacust-cdn'];
        if (req.headers) delete req.headers['x-remnacust-cdn'];
        if (!req.url.startsWith('/api/sub/')) return next();
        if (!req.url.startsWith(prefix) && selector === undefined) return next();
        res.set('Cache-Control', 'private, no-store');
        if (selector !== undefined && (typeof selector !== 'string' ||
            !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(selector)))
            return res.status(404).end();
        if (!req.url.startsWith(prefix)) {
            if (!['GET', 'HEAD'].includes(req.method)) return res.status(404).end();
            try {
                const base = await resolve(selector as string);
                if (res.destroyed || res.writableEnded) return;
                return withGeofileOrigin(base, next);
            } catch {
                return res.status(404).end();
            }
        }
        const match = /^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})(\/[^?#]*)(\?[^#]*)?$/.exec(
            req.url.slice(prefix.length),
        );
        if (
            !match ||
            (selector !== undefined && selector !== match[1]) ||
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

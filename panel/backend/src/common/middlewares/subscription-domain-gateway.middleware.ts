import type { Request, Response, NextFunction } from 'express';

import { withGeofileOrigin } from '../utils/geofile-request-context';
import { consumeCdnSelector } from '../utils/cdn-request-header';

// The path is a public selector, not a credential. Existing subscription, HWID
// and geofile handlers still perform their normal checks after normalization.
export function subscriptionDomainGateway(
    resolve: (uuid: string) => Promise<string>,
    resolveHeaderName?: (uuid: string) => Promise<string>,
) {
    const prefix = '/api/sub/cdn/';
    return async (req: Request, res: Response, next: NextFunction) => {
        const selection = consumeCdnSelector(req.headers);
        const selector = selection.uuid;
        if (!req.url.startsWith('/api/sub/')) return next();
        if (selection.invalid) {
            res.set('Cache-Control', 'private, no-store');
            return res.status(404).end();
        }
        if (!req.url.startsWith(prefix) && selector === undefined) return next();
        res.set('Cache-Control', 'private, no-store');
        if (!req.url.startsWith(prefix)) {
            if (!['GET', 'HEAD'].includes(req.method)) return res.status(404).end();
            try {
                const base = await resolve(selector as string);
                if (res.destroyed || res.writableEnded) return;
                if (selection.name && selection.name !== (await resolveHeaderName?.(selector as string))?.toLowerCase())
                    return res.status(404).end();
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
            if (selection.name && selection.name !== (await resolveHeaderName?.(match[1]))?.toLowerCase())
                return res.status(404).end();
            req.url = '/api/sub' + match[2] + (match[3] ?? '');
            return withGeofileOrigin(base, next);
        } catch {
            return res.status(404).end();
        }
    };
}

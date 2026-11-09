import type {
    DomainAccessRequest,
    DomainAccessDecision,
} from '../utils/subscription-domain-access';
import type { Request, Response, NextFunction } from 'express';

import { consumeCdnSelector } from '../utils/cdn-request-header';
import { withGeofileOrigin } from '../utils/geofile-request-context';

// The path is a public selector, not a credential. Existing subscription, HWID
// and geofile handlers still perform their normal checks after normalization.
export function subscriptionDomainGateway(
    resolve: (uuid: string) => Promise<string>,
    resolveHeaderName?: (uuid: string) => Promise<string>,
    checkAccess?: (input: DomainAccessRequest, request: Request) => Promise<DomainAccessDecision>,
) {
    const prefix = '/api/sub/cdn/';
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!/^\/api\/sub\//i.test(req.url)) return next();
        if (/^\/api\/sub\/domains\/(?:access|[a-f0-9-]{36}\/resolve)(?:\?|$)/i.test(req.url))
            return next();
        req.url = '/api/sub/' + req.url.slice('/api/sub/'.length);
        const selection = consumeCdnSelector(req.headers);
        const selector = selection.uuid;
        if (checkAccess && !selection.invalid) {
            res.set('Cache-Control', 'private, no-store');
            res.set('Referrer-Policy', 'no-referrer');
            if (!['GET', 'HEAD'].includes(req.method)) return res.status(404).end();
            try {
                const pathSelection = /^\/api\/sub\/cdn\/([a-f0-9-]{36})\//.exec(req.url);
                const { invalid: _, ...selected } = selection;
                const decision = await checkAccess(
                    {
                        host: req.headers.host ?? '',
                        url: req.url,
                        api: true,
                        method: req.method as 'GET' | 'HEAD',
                        ...selected,
                        ...(pathSelection && !selector ? { uuid: pathSelection[1] } : {}),
                    },
                    req,
                );
                if (res.destroyed || res.writableEnded) return;
                if (decision.action === 'block') return res.status(403).end();
                if (decision.action === 'redirect')
                    return res.status(307).set('Location', decision.location!).end();
            } catch {
                return res.status(503).end();
            }
        }
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
                if (
                    selection.name &&
                    selection.name !==
                        (await resolveHeaderName?.(selector as string))?.toLowerCase()
                )
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
            if (
                selection.name &&
                selection.name !== (await resolveHeaderName?.(match[1]))?.toLowerCase()
            )
                return res.status(404).end();
            req.url = '/api/sub' + match[2] + (match[3] ?? '');
            return withGeofileOrigin(base, next);
        } catch {
            return res.status(404).end();
        }
    };
}

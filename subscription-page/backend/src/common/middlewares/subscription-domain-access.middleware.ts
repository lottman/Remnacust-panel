import type { Request, Response, NextFunction } from 'express';

import { consumeCdnSelector } from '../utils/cdn-request-header';
import {
    withSubscriptionDomain,
    type SubscriptionDomainContext,
} from '../utils/subscription-domain-context';

export type DomainAccessRequest = {
    host: string;
    url: string;
    method: 'GET' | 'HEAD';
    uuid?: string;
    name?: string;
    proof?: string;
};
export type DomainAccessDecision = {
    action: 'allow' | 'block' | 'redirect';
    location?: string;
    authenticated?: boolean;
    domain?: SubscriptionDomainContext;
};
export function subscriptionDomainAccess(
    check: (input: DomainAccessRequest) => Promise<DomainAccessDecision>,
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (/^\/internal\/health\/?(?:\?|$)/.test(req.url)) return next();
        res.set('Cache-Control', 'private, no-store');
        res.set('Referrer-Policy', 'no-referrer');
        if (!['GET', 'HEAD'].includes(req.method)) return res.status(404).end();
        const { invalid, ...selection } = consumeCdnSelector({ ...req.headers });
        if (invalid) return res.status(404).end();
        const marker = /\/cdn\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\//.exec(
            req.url.split('?', 1)[0],
        );
        if (marker && selection.uuid && marker[1] !== selection.uuid) return res.status(404).end();
        try {
            const decision = await check({
                host: req.headers.host ?? '',
                url: req.url,
                method: req.method as 'GET' | 'HEAD',
                ...selection,
                ...(marker && !selection.uuid ? { uuid: marker[1] } : {}),
            });
            if (res.destroyed || res.writableEnded) return;
            if (decision.action === 'block') return res.status(403).end();
            if (decision.action === 'redirect')
                return res.status(307).set('Location', decision.location!).end();
            if (!decision.domain) return next();
            const domain = {
                ...decision.domain,
                ...(decision.authenticated && selection.proof && selection.uuid
                    ? { requestHeaderValue: selection.uuid + '.' + selection.proof }
                    : {}),
            };
            return withSubscriptionDomain(domain, next);
        } catch {
            return res.status(503).end();
        }
    };
}

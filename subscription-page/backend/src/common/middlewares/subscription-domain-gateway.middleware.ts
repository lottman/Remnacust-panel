import type { Request, Response, NextFunction } from 'express';
import { withSubscriptionDomain, type SubscriptionDomainContext } from '../utils/subscription-domain-context';
import { consumeCdnSelector } from '../utils/cdn-request-header';

export function subscriptionDomainGateway(
    resolve: (uuid: string) => Promise<SubscriptionDomainContext>,
    customPrefix = '',
) {
    const base = customPrefix ? '/' + customPrefix.replace(/^\/+|\/+$/g, '') : '';
    return async (req: Request, res: Response, next: NextFunction) => {
        const selection = consumeCdnSelector(req.headers);
        if (selection.invalid) {
            res.set('Cache-Control', 'private, no-store');
            return res.status(404).end();
        }
        const selector = selection.uuid;
        const path = req.url.split('?', 1)[0];
        let marker = path.lastIndexOf('/cdn/');
        // A configured legacy prefix may itself be /cdn. With a header, only
        // a UUID after /cdn/ is an explicit path selector; ordinary keys stay intact.
        if (selector !== undefined && marker >= 0 &&
            !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}(?:\/|$)/.test(path.slice(marker + 5)))
            marker = -1;
        if (marker < 0 && selector === undefined) return next();
        if (marker < 0) {
            res.set('Cache-Control', 'private, no-store');
            if (!['GET', 'HEAD'].includes(req.method)) return res.status(404).end();
            try {
                const domain = await resolve(selector as string);
                if (res.destroyed || res.writableEnded) return;
                if (domain.uuid !== selector) return res.status(404).end();
                return withSubscriptionDomain(domain, next);
            } catch (error) {
                return res.status((error as { status?: number }).status === 404 ? 404 : 503).end();
            }
        }
        const publicPrefix = path.slice(0, marker);
        res.set('Cache-Control', 'private, no-store');
        const match = /^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})(\/[^?#]*)(\?[^#]*)?$/.exec(req.url.slice(marker + 5));
        if (!match || (selector !== undefined && selector !== match[1]) || !['GET', 'HEAD'].includes(req.method) || match[2].includes('/cdn/') ||
            !/^(?:\/[A-Za-z0-9._~-]+)*$/.test(publicPrefix) ||
            /\/cdn\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}(?:\/|$)/.test(publicPrefix) ||
            /[%\\]/.test(path) || path.split('/').some(part => part === '.' || part === '..') || match[2].startsWith('//'))
            return res.status(404).end();
        try {
            const domain = await resolve(match[1]);
            if (res.destroyed || res.writableEnded) return;
            if (domain.uuid !== match[1] || new URL(domain.publicBaseUrl).pathname !== `${publicPrefix}/cdn/${match[1]}`)
                return res.status(404).end();
            req.url = base + match[2] + (match[3] ?? '');
            return withSubscriptionDomain(domain, next);
        } catch (error) {
            return res.status((error as { status?: number }).status === 404 ? 404 : 503).end();
        }
    };
}

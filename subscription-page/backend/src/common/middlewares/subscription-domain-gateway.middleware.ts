import type { Request, Response, NextFunction } from 'express';
import { withSubscriptionDomain, type SubscriptionDomainContext } from '../utils/subscription-domain-context';

export function subscriptionDomainGateway(
    resolve: (uuid: string) => Promise<SubscriptionDomainContext>,
    customPrefix = '',
) {
    const base = customPrefix ? '/' + customPrefix.replace(/^\/+|\/+$/g, '') : '';
    return async (req: Request, res: Response, next: NextFunction) => {
        const path = req.url.split('?', 1)[0];
        const marker = path.lastIndexOf('/cdn/');
        if (marker < 0) return next();
        const publicPrefix = path.slice(0, marker);
        res.set('Cache-Control', 'private, no-store');
        const match = /^([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})(\/[^?#]*)(\?[^#]*)?$/.exec(req.url.slice(marker + 5));
        if (!match || !['GET', 'HEAD'].includes(req.method) || match[2].includes('/cdn/') ||
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

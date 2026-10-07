import { RequestHandler } from 'express';

export function dynamicRequestBudget(maximum = 128): RequestHandler {
    let active = 0;
    return (req, res, next) => {
        const ip = req.socket?.remoteAddress;
        if ((req.path === '/internal/health' || req.path === '/internal/health/') &&
            !req.headers?.['x-forwarded-for'] &&
            (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) return next();
        if (req.path.startsWith('/assets/') && !req.path.startsWith('/assets/.app-config')) return next();
        if (active >= maximum) {
            res.set('Cache-Control', 'private, no-store');
            res.set('Retry-After', '2');
            res.status(503).send('Subscription service is busy. Please retry.');
            return;
        }
        active++;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            active--;
            res.off('finish', release);
            res.off('close', release);
        };
        res.once('finish', release);
        res.once('close', release);
        next();
    };
}

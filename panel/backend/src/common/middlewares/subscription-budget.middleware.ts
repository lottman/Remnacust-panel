import { RequestHandler } from 'express';

/** Protect the API/DB pool from a burst of public subscription requests. */
export function subscriptionBudget(maximum = 64): RequestHandler {
    let active = 0;
    return (req, res, next) => {
        // Express routes are case-insensitive unless explicitly configured otherwise.
        if (!req.path.toLowerCase().startsWith('/api/sub/')) return next();
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

import { RequestHandler, Response } from 'express';
import { CallHandler, ExecutionContext, NestInterceptor, ServiceUnavailableException } from '@nestjs/common';
import { defer, lastValueFrom, Observable } from 'rxjs';

interface RequestLease {
    closed: boolean;
    pending: number;
    releaseIfIdle: () => void;
}

const leases = new WeakMap<Response, RequestLease>();

export async function runDynamicRequestWork<T>(response: Response, work: () => Promise<T>): Promise<T> {
    const lease = leases.get(response);
    if (!lease) return work();
    if (lease.closed || response.destroyed) throw new ServiceUnavailableException('Request has closed');
    lease.pending++;
    try { return await work(); }
    finally { lease.pending--; lease.releaseIfIdle(); }
}

export class DynamicRequestBudgetInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const response = context.switchToHttp().getResponse<Response>();
        return defer(() => runDynamicRequestWork(response, () => lastValueFrom(next.handle())));
    }
}

export function dynamicRequestBudget(maximum = 128): RequestHandler {
    let active = 0;
    let geofiles = 0;
    const maximumGeofiles = Math.min(16, Math.floor(maximum / 2));
    return (req, res, next) => {
        const ip = req.socket?.remoteAddress;
        if (
            (req.path === '/internal/health' || req.path === '/internal/health/') &&
            !req.headers?.['x-forwarded-for'] &&
            (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')
        )
            return next();
        if (req.path.startsWith('/assets/') && !req.path.startsWith('/assets/.app-config'))
            return next();
        const geofile = /(?:^|\/)geofiles(?:\/|$)/i.test(req.path);
        if (active >= maximum || (geofile && geofiles >= maximumGeofiles)) {
            res.set('Cache-Control', 'private, no-store');
            res.set('Retry-After', '2');
            res.status(503).send('Subscription service is busy. Please retry.');
            return;
        }
        active++;
        if (geofile) geofiles++;
        let released = false;
        const lease: RequestLease = {
            closed: false,
            pending: 0,
            releaseIfIdle: () => {
                if (released || !lease.closed || lease.pending !== 0) return;
                released = true;
                active--;
                if (geofile) geofiles--;
                res.off('finish', release);
                res.off('close', release);
            },
        };
        const release = () => { lease.closed = true; lease.releaseIfIdle(); };
        leases.set(res, lease);
        res.once('finish', release);
        res.once('close', release);
        try {
            next();
        } catch (error) {
            release();
            throw error;
        }
    };
}

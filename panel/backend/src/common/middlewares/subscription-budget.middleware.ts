import { RequestHandler, Response } from 'express';
import { defer, lastValueFrom, Observable } from 'rxjs';

import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    ServiceUnavailableException,
} from '@nestjs/common';

interface SubscriptionLease {
    closed: boolean;
    pending: number;
    abort: AbortController;
    releaseIfIdle: () => void;
}

const leases = new WeakMap<Response, SubscriptionLease>();

export function subscriptionRequestSignal(response: Response): AbortSignal | undefined {
    return leases.get(response)?.abort.signal;
}

/** A closed socket does not cancel an already running database or rendering operation. */
export async function runSubscriptionWork<T>(
    response: Response,
    work: () => Promise<T>,
): Promise<T> {
    const lease = leases.get(response);
    if (!lease) return work();
    if (lease.closed || response.destroyed) {
        throw new ServiceUnavailableException('Subscription request has closed.');
    }
    lease.pending++;
    try {
        return await work();
    } finally {
        lease.pending--;
        lease.releaseIfIdle();
    }
}

@Injectable()
export class SubscriptionBudgetInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const response = context.switchToHttp().getResponse<Response>();
        // Await the handler itself: an Observable teardown must not release unfinished work.
        return defer(() => runSubscriptionWork(response, () => lastValueFrom(next.handle())));
    }
}

/** Protect the API/DB pool from a burst of public subscription requests. */
export function subscriptionBudget(maximum = 64, protectedMaximum = 2): RequestHandler {
    let active = 0;
    let protectedActive = 0;
    return (req, res, next) => {
        // Express routes are case-insensitive unless explicitly configured otherwise.
        const pathname = req.path.toLowerCase();
        const protectedBulk = req.method === 'GET' && /^\/api\/subscriptions\/?$/.test(pathname);
        if (!pathname.startsWith('/api/sub/') && !protectedBulk) return next();
        if (protectedBulk ? protectedActive >= protectedMaximum : active >= maximum) {
            res.set('Cache-Control', 'private, no-store');
            res.set('Retry-After', '2');
            res.status(503).send('Subscription service is busy. Please retry.');
            return;
        }
        if (protectedBulk) protectedActive++;
        else active++;
        let released = false;
        const lease: SubscriptionLease = {
            closed: false,
            pending: 0,
            abort: new AbortController(),
            releaseIfIdle: () => {
                if (released || !lease.closed || lease.pending !== 0) return;
                released = true;
                if (protectedBulk) protectedActive--;
                else active--;
                res.off('finish', settle);
                res.off('close', settle);
            },
        };
        const settle = () => {
            lease.closed = true;
            lease.abort.abort();
            lease.releaseIfIdle();
        };
        leases.set(res, lease);
        res.once('finish', settle);
        res.once('close', settle);
        try {
            next();
        } catch (error) {
            settle();
            throw error;
        }
    };
}

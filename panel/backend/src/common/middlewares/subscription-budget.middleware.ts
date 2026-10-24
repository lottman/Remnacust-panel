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
    releaseIfIdle: () => void;
}

const leases = new WeakMap<Response, SubscriptionLease>();

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
        const lease: SubscriptionLease = {
            closed: false,
            pending: 0,
            releaseIfIdle: () => {
                if (released || !lease.closed || lease.pending !== 0) return;
                released = true;
                active--;
                res.off('finish', settle);
                res.off('close', settle);
            },
        };
        const settle = () => {
            lease.closed = true;
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

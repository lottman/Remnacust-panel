import { Observable } from 'rxjs';

import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { ROOT } from '@libs/contracts/api';

import { RouteCounterService } from '../route-counter.service';

@Injectable()
export class RouteCounterInterceptor implements NestInterceptor {
    private readonly slotCache = new WeakMap<Function, number>();

    constructor(private readonly routeCounterService: RouteCounterService) {}

    intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
        const slot = this.resolveSlot(ctx);
        this.routeCounterService.increment(slot);

        return next.handle();
    }

    private resolveSlot(ctx: ExecutionContext): number {
        const handler = ctx.getHandler();

        const cached = this.slotCache.get(handler);
        if (cached !== undefined) {
            return cached;
        }

        const slot = this.routeCounterService.register(this.buildKey(ctx));
        this.slotCache.set(handler, slot);

        return slot;
    }

    private buildKey(ctx: ExecutionContext): string {
        const handler = ctx.getHandler();
        const controller = ctx.getClass();

        const controllerPaths = this.toPaths(Reflect.getMetadata(PATH_METADATA, controller));
        const methodPaths = this.toPaths(Reflect.getMetadata(PATH_METADATA, handler));
        const method: RequestMethod = Reflect.getMetadata(METHOD_METADATA, handler);

        const paths: string[] = [];
        for (const controllerPath of controllerPaths) {
            for (const methodPath of methodPaths) {
                paths.push(this.joinPath(ROOT, controllerPath, methodPath));
            }
        }

        return `${RequestMethod[method]} ${paths.join('|')}`;
    }

    private toPaths(value: string | string[] | undefined): string[] {
        if (Array.isArray(value)) {
            return value.length > 0 ? value : [''];
        }
        return [value ?? ''];
    }

    private joinPath(...segments: string[]): string {
        const path = segments
            .filter((segment) => segment.length > 0)
            .join('/')
            .replace(/\/{2,}/g, '/');

        return path.length > 1 ? path.replace(/\/$/, '') : path;
    }
}

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

import { ROLE } from '@libs/contracts/constants';

import { NodeResponseModel } from './node.response.model';

@Injectable()
export class NodeResponseInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const { user } = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
        if (user?.role === ROLE.ADMIN) return next.handle();

        return next.handle().pipe(
            map((body: unknown) => {
                if (!body || typeof body !== 'object' || !('response' in body)) return body;

                const redact = (node: unknown): unknown => {
                    if (!(node instanceof NodeResponseModel)) return node;
                    return {
                        ...node,
                        configProfile: {
                            ...node.configProfile,
                            activeInbounds: node.configProfile.activeInbounds.map((inbound) => ({
                                ...inbound,
                                rawInbound: null,
                            })),
                        },
                    };
                };

                return {
                    ...body,
                    response: Array.isArray(body.response)
                        ? body.response.map(redact)
                        : redact(body.response),
                };
            }),
        );
    }
}

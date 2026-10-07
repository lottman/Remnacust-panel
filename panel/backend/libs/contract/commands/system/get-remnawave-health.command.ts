import { z } from 'zod';

import { REST_API, SYSTEM_ROUTES } from '../../api';
import { getEndpointDetails } from '../../constants';

export namespace GetRemnawaveHealthCommand {
    export const url = REST_API.SYSTEM.HEALTH;
    export const TSQ_url = url;

    export const endpointDetails = getEndpointDetails(
        SYSTEM_ROUTES.HEALTH,
        'get',
        'Get Remnawave Health',
        { scope: 'remnawave-health', kind: 'read' },
    );

    export const ResponseSchema = z.object({
        response: z.object({
            runtimeMetrics: z.array(
                z.object({
                    rss: z.number(),
                    heapUsed: z.number(),
                    heapTotal: z.number(),
                    external: z.number(),
                    arrayBuffers: z.number(),
                    eventLoopDelayMs: z.number(),
                    eventLoopP99Ms: z.number(),
                    activeHandles: z.number(),
                    uptime: z.number(),
                    pid: z.number(),
                    timestamp: z.number(),
                    instanceId: z.string(),
                    instanceType: z.string(),
                }),
            ),
        }),
    });

    export type Response = z.infer<typeof ResponseSchema>;
}

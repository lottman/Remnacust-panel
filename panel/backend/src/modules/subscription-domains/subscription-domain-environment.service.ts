import { createHmac } from 'node:crypto';
import { request } from 'node:http';
import { z } from 'zod';

import { Injectable } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { HttpExceptionWithErrorCodeType } from '@common/exception/http-exeception-with-error-code.type';

const snapshotSchema = z.object({
    value: z.string().max(512).nullable(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    valid: z.boolean(),
});
export type DomainEnvironmentSnapshot = z.infer<typeof snapshotSchema>;

@Injectable()
export class SubscriptionDomainEnvironmentService {
    constructor(private readonly config: TypedConfigService) {}

    read(): Promise<DomainEnvironmentSnapshot> {
        return this.call();
    }

    write(value: string | null, expectedRevision: string): Promise<DomainEnvironmentSnapshot> {
        return this.call({ value, expectedRevision });
    }

    private call(change?: {
        value: string | null;
        expectedRevision: string;
    }): Promise<DomainEnvironmentSnapshot> {
        const token = createHmac('sha256', this.config.getOrThrow('APP_SECRET'))
            .update('remnacust-panel-update-v1')
            .digest('hex');
        const body = change === undefined ? undefined : JSON.stringify(change);
        const failed = (changed = false) =>
            new HttpExceptionWithErrorCodeType(
                changed ? 'SUBSCRIPTION_DOMAIN_ENV_CHANGED' : 'SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE',
                changed ? 'SUBSCRIPTION_DOMAIN_ENV_CHANGED' : 'SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE',
                changed ? 409 : 503,
            );
        return new Promise((resolve, reject) => {
            const req = request(
                {
                    socketPath: '/run/remnacust-control/update.sock',
                    path: '/subscription-domain',
                    method: body ? 'POST' : 'GET',
                    headers: {
                        Authorization: 'Bearer ' + token,
                        ...(body
                            ? {
                                  'Content-Type': 'application/json',
                                  'Content-Length': Buffer.byteLength(body),
                              }
                            : {}),
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    let size = 0;
                    res.on('data', (chunk: Buffer) => {
                        size += chunk.length;
                        if (size > 2048) req.destroy(new Error('CONTROL_RESPONSE_LIMIT'));
                        else chunks.push(chunk);
                    });
                    res.on('aborted', () => reject(failed()));
                    res.on('error', () => reject(failed()));
                    res.on('end', () => {
                        try {
                            const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                            if (res.statusCode !== 200)
                                return reject(failed(value?.error === 'DOMAIN_CHANGED'));
                            resolve(snapshotSchema.parse(value));
                        } catch {
                            reject(failed());
                        }
                    });
                },
            );
            req.setTimeout(3000, () => req.destroy(new Error('CONTROL_TIMEOUT')));
            req.on('error', () => reject(failed()));
            req.end(body);
        });
    }
}

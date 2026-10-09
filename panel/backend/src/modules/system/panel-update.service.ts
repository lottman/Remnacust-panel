import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { z } from 'zod';

import { Injectable, ServiceUnavailableException, ConflictException } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';

export const panelUpdateStateSchema = z.object({
    available: z.boolean(),
    installedVersion: z.string().nullable(),
    active: z.boolean(),
    phase: z.enum(['idle', 'queued', 'checking', 'updating', 'completed', 'failed']),
    jobId: z.string().uuid().nullable(),
    targetVersion: z.string().nullable(),
    error: z.string().nullable(),
});
const CONTROL = '/run/remnacust-control';
const unavailable = {
    available: false,
    installedVersion: null,
    active: false,
    phase: 'idle' as const,
    jobId: null,
    targetVersion: null,
    error: null,
};
export type PanelUpdateState = z.infer<typeof panelUpdateStateSchema>;

@Injectable()
export class PanelUpdateService {
    private cached: PanelUpdateState = unavailable;
    private expiresAt = 0;
    private generation = 0;
    private pending?: Promise<PanelUpdateState>;
    constructor(private readonly config: TypedConfigService) {}

    async isActive(): Promise<boolean> {
        try {
            const raw = await readFile(CONTROL + '/status.json', 'utf8');
            return raw.length <= 16384 && JSON.parse(raw).active === true;
        } catch {
            return this.cached.active;
        }
    }

    async status(): Promise<PanelUpdateState> {
        if (Date.now() < this.expiresAt) return this.cached;
        if (this.pending) return this.pending;
        const generation = this.generation;
        this.pending = this.call('/status')
            .catch(async () => {
                // Keep maintenance visible while the host service is restarting.
                try {
                    const raw = await readFile(CONTROL + '/status.json', 'utf8');
                    if (raw.length > 16384) return unavailable;
                    return panelUpdateStateSchema.parse({
                        ...JSON.parse(raw),
                        available: false,
                        installedVersion: null,
                    });
                } catch {
                    return unavailable;
                }
            })
            .then((state) => {
                if (generation !== this.generation) return this.cached;
                this.cached = state;
                this.expiresAt = Date.now() + 500;
                return state;
            })
            .finally(() => {
                this.pending = undefined;
            });
        return this.pending;
    }

    async start(body: { targetVersion: string; requestId: string }): Promise<PanelUpdateState> {
        const state = await this.call('/update', body);
        this.generation++;
        this.cached = state;
        this.expiresAt = 0;
        return state;
    }

    private call(path: string, data?: unknown): Promise<PanelUpdateState> {
        const token = createHmac('sha256', this.config.getOrThrow('APP_SECRET'))
            .update('remnacust-panel-update-v1')
            .digest('hex');
        const body = data === undefined ? undefined : JSON.stringify(data);
        return new Promise((resolve, reject) => {
            const req = request(
                {
                    socketPath: CONTROL + '/update.sock',
                    path,
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
                    let bytes = 0;
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => {
                        bytes += chunk.length;
                        if (bytes > 16384) req.destroy(new Error('Response too large'));
                        else chunks.push(chunk);
                    });
                    res.on('error', reject);
                    res.on('aborted', () =>
                        reject(new ServiceUnavailableException('UPDATE_UNAVAILABLE')),
                    );
                    res.on('end', () => {
                        if (res.statusCode === 409)
                            return reject(new ConflictException('UPDATE_BUSY'));
                        if (res.statusCode !== 200 && res.statusCode !== 202) {
                            return reject(new ServiceUnavailableException('UPDATE_UNAVAILABLE'));
                        }
                        try {
                            resolve(
                                panelUpdateStateSchema.parse(
                                    JSON.parse(Buffer.concat(chunks).toString('utf8')),
                                ),
                            );
                        } catch {
                            reject(new ServiceUnavailableException('UPDATE_UNAVAILABLE'));
                        }
                    });
                },
            );
            req.setTimeout(20000, () => req.destroy(new Error('Update service timeout')));
            req.on('error', () => reject(new ServiceUnavailableException('UPDATE_UNAVAILABLE')));
            req.end(body);
        });
    }
}

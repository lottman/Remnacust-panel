import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { AxiosService } from '@common/axios';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { RawCacheService } from '@common/raw-cache';

import { NodePortPlansService } from './node-port-plans.service';
import { GetNodeByUuidQuery } from './queries/get-node-by-uuid/get-node-by-uuid.query';

export function transportFailure(message: string) {
    if (/cert|tls|ssl|servername|hostname|self.signed/i.test(message)) return 'certificate';
    if (/ENOTFOUND|EAI_AGAIN|resolve|dns/i.test(message)) return 'dns';
    if (/ECONNREFUSED/i.test(message)) return 'refused';
    if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(message)) return 'timeout';
    if (/401|403|unauthoriz|forbidden|jwt/i.test(message)) return 'authorization';
    return 'transport';
}
type Check = { id: string; status: 'passed' | 'warning' | 'failed' | 'skipped'; code: string };

@Injectable()
export class NodeDiagnosticsService {
    constructor(
        private readonly queries: QueryBus,
        private readonly axios: AxiosService,
        private readonly cache: RawCacheService,
        private readonly plans: NodePortPlansService,
    ) {}

    async inspect(uuid: string) {
        const node = errorHandler(await this.queries.execute(new GetNodeByUuidQuery(uuid)));
        const bucket = Math.floor(Date.now() / 10000);
        if (
            (await this.cache.incrementWithTtl(
                `remnacust:node-diagnostics:${uuid}:${bucket}`,
                20,
            )) > 2
        )
            throw new HttpException(
                'Wait before repeating diagnostics',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        const startedAt = Date.now();
        const checks: Check[] = [];
        if (node.isDisabled) checks.push({ id: 'connection', status: 'skipped', code: 'disabled' });
        else {
            const result = await this.axios.getSystemStats(node);
            if (!result.isOk)
                checks.push({
                    id: 'connection',
                    status: 'failed',
                    code: transportFailure(result.message ?? ''),
                });
            else {
                checks.push({ id: 'connection', status: 'passed', code: 'authenticated' });
                checks.push({
                    id: 'xray',
                    status: result.response.xrayInfo === null ? 'failed' : 'passed',
                    code: result.response.xrayInfo === null ? 'xrayMissing' : 'xrayRunning',
                });
                checks.push({
                    id: 'users',
                    status:
                        result.response.userStateSynchronized === false
                            ? 'warning'
                            : result.response.userStateSynchronized === true
                              ? 'passed'
                              : 'skipped',
                    code:
                        result.response.userStateSynchronized === false
                            ? 'syncPending'
                            : result.response.userStateSynchronized === true
                              ? 'synchronized'
                              : 'unsupported',
                });
            }
        }
        try {
            const plan = await this.plans.get(uuid);
            checks.push({
                id: 'configuration',
                status:
                    plan.status === 'APPLIED'
                        ? 'passed'
                        : plan.status === 'ERROR'
                          ? 'failed'
                          : 'warning',
                code:
                    plan.status === 'APPLIED'
                        ? 'applied'
                        : plan.status === 'ERROR'
                          ? 'applyFailed'
                          : plan.status === 'PENDING'
                            ? 'applyPending'
                            : 'unmanaged',
            });
        } catch {
            checks.push({
                id: 'configuration',
                status: 'failed',
                code: 'configurationUnavailable',
            });
        }
        return {
            nodeUuid: uuid,
            checkedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            checks,
            alertMutedUntil: await this.cache.get<number>(`remnacust:node-alert-mute:${uuid}`),
            scope: 'management-and-runtime' as const,
        };
    }

    async mute(uuid: string, minutes: number) {
        errorHandler(await this.queries.execute(new GetNodeByUuidQuery(uuid)));
        const key = `remnacust:node-alert-mute:${uuid}`;
        if (!minutes) {
            await this.cache.del(key);
            return { alertMutedUntil: null };
        }
        const until = Date.now() + minutes * 60000;
        await this.cache.set(key, until, minutes * 60);
        return { alertMutedUntil: until };
    }
}

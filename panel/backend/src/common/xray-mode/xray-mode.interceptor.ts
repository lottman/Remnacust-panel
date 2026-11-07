import { CallHandler, ConflictException, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '@common/database/prisma.service';
import { customCoreConfigPaths } from './xray-mode-policy';
import { XrayModeService } from './xray-mode.service';

const FIELDS = new Set([
    'userTrafficLimitBytes', 'serverSpeedLimitMbps', 'speedLimitMbps',
    'deviceSpeedLimitMbps', 'totalSpeedLimitMbps', 'trafficMultiplier',
    'alwaysAvailable', 'onlyWhenInactive', 'domainRules',
]);
const empty = (key: string, value: unknown): boolean =>
    value === undefined || value === null || value === false || value === '' ||
    (key === 'trafficMultiplier' ? Number(value) === 1 : Number(value) === 0) ||
    (key === 'domainRules' && typeof value === 'object' && (value as { mode?: string }).mode === 'OFF');
const equal = (left: unknown, right: unknown) =>
    typeof left === 'object' || typeof right === 'object'
        ? isDeepStrictEqual(left, right) : String(left ?? '') === String(right ?? '');

@Injectable()
export class XrayModeInterceptor implements NestInterceptor {
    constructor(private readonly modes: XrayModeService, private readonly prisma: PrismaService) {}

    async intercept(context: ExecutionContext, next: CallHandler) {
        const request = context.switchToHttp().getRequest<{
            method: string; path: string; body?: Record<string, unknown>; params?: Record<string, string>;
        }>();
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next.handle();
        const pathname = request.path.toLowerCase().replace(/^\/api(?=\/)/, '');
        const limits = /^\/limits(?:\/|$)/.test(pathname) && !pathname.startsWith('/limits/quota-recovery');
        const body = request.body;
        const portPlan = /^\/nodes\/[a-f0-9-]+\/ports(?:\/|$)/i.test(pathname) && body?.enabled === true;
        const fields = body && /^\/hosts(?:\/|$)/.test(pathname)
            ? Object.keys(body).filter(key => FIELDS.has(key) && !empty(key, body[key])) : [];
        const paths = body ? [...new Set([body.config, body.templateJson, body.templateYaml]
            .filter(config => config && typeof config === 'object')
            .flatMap(config => customCoreConfigPaths(config)))] : [];
        if (!limits && !portPlan && !fields.length && !paths.length) return next.handle();
        if (await this.modes.isCustom()) return next.handle();
        if (fields.length && !limits && !portPlan && !paths.length && pathname === '/hosts' && !Array.isArray(body?.uuids)) {
            const uuid = body?.uuid ?? request.params?.uuid;
            if (typeof uuid === 'string' && /^[a-f0-9-]{36}$/i.test(uuid)) {
                const current = await this.prisma.hosts.findUnique({ where: { uuid } });
                if (current && fields.every(key => equal(body![key], (current as unknown as Record<string, unknown>)[key]))) return next.handle();
            }
        }
        throw new ConflictException({ code: 'CUSTOM_XRAY_REQUIRED', features: paths.length ? paths : fields.length ? fields : [limits ? 'host-limits' : 'live-port-plans'] });
    }
}

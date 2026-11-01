import { Prisma, SubscriptionDomains } from '@prisma/client';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';
import { SubscriptionDomainInput } from '@libs/contracts/models/subscription-domain.schema';

import { HttpExceptionWithErrorCodeType } from '../../common/exception/http-exeception-with-error-code.type';
import { configuredSubscriptionDomain } from '../../common/utils/public-subscription-domain';
import { isRestApi } from '../../common/utils/startup-app/is-development';
import { subscriptionDomainBase } from '../../common/utils/subscription-domain-url';
import { cdnRequestHeaderName } from '../../common/utils/cdn-request-header';
import {
    SubscriptionDomainEnvironmentService,
    DomainEnvironmentSnapshot,
} from './subscription-domain-environment.service';

const LOCK = 72626389;
const counts = { _count: { select: { users: true, aliases: true } } } as const;

@Injectable()
export class SubscriptionDomainsService implements OnModuleInit, OnModuleDestroy {
    private environmentTimer?: ReturnType<typeof setInterval>;
    private readonly logger = new Logger(SubscriptionDomainsService.name);
    private cache: { until: number; rows: SubscriptionDomains[] } | undefined;
    private pending: Promise<SubscriptionDomains[]> | undefined;
    private generation = 0;
    private readonly configuredDefault: { domain: string; path: string } | undefined;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: TypedConfigService,
        private readonly environment?: SubscriptionDomainEnvironmentService,
    ) {
        this.configuredDefault = configuredSubscriptionDomain(
            this.config.getOrThrow('SUB_PUBLIC_DOMAIN'),
        );
    }

    async onModuleInit() {
        const configured = this.configuredDefault;
        if (configured)
            await this.prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
                if ((await tx.subscriptionDomains.count()) === 0) {
                    await tx.subscriptionDomains.create({
                        data: {
                            domain: configured.domain,
                            path: configured.path,
                            name: configured.domain.slice(0, 100),
                            kind: 'PRIMARY',
                            isDefault: true,
                        },
                    });
                }
            });
        if (isRestApi()) {
            await this.synchronizeEnvironment();
            this.environmentTimer = setInterval(() => {
                void this.synchronizeEnvironment();
            }, 30000);
            this.environmentTimer.unref();
        }
    }
    onModuleDestroy() {
        if (this.environmentTimer) clearInterval(this.environmentTimer);
    }
    private model(row: SubscriptionDomains & { _count: { users: number; aliases: number } }) {
        const { _count, ...data } = row;
        return { ...data, publicBaseUrl: subscriptionDomainBase(row), requestHeaderName: row.kind === 'CDN' ? cdnRequestHeaderName(row.uuid) : null, usersCount: _count.users, aliasesCount: _count.aliases };
    }
    async list() {
        return (
            await this.prisma.subscriptionDomains.findMany({
                include: counts,
                orderBy: [{ isDefault: 'desc' }, { domain: 'asc' }],
                take: 128,
            })
        ).map((row) => this.model(row));
    }
    async listing() {
        const environment = await this.synchronizeEnvironment();
        return { response: await this.list(), environment };
    }

    private async synchronizeEnvironment(): Promise<
        'synced' | 'unavailable' | 'invalid' | 'conflict'
    > {
        if (!this.environment) return 'unavailable';
        try {
            const status = await this.prisma.$transaction(
                async (tx) => {
                    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
                    const before = await this.environment!.read();
                    const configured = configuredSubscriptionDomain(before.value);
                    if (!before.valid || !configured) return 'invalid' as const;
                    const current = await tx.subscriptionDomains.findUnique({
                        where: { domain: configured.domain },
                    });
                    if (
                        current?.kind === 'CDN' ||
                        (!current && (await tx.subscriptionDomains.count()) >= 128)
                    )
                        return 'conflict' as const;
                    const main = await tx.subscriptionDomains.findFirst({
                        where: { isDefault: true },
                    });
                    if (!current?.isDefault || current.path !== configured.path) {
                        if (main)
                            await tx.subscriptionDomains.updateMany({
                                where: { isDefault: true },
                                data: { isDefault: false },
                            });
                        if (current)
                            await tx.subscriptionDomains.update({
                                where: { uuid: current.uuid },
                                data: { isDefault: true, path: configured.path },
                            });
                        else
                            await tx.subscriptionDomains.create({
                                data: {
                                    ...configured,
                                    name: configured.domain.slice(0, 100),
                                    kind: 'PRIMARY',
                                    isDefault: true,
                                },
                            });
                    }
                    // The host also aligns legacy inline Compose values with its .env.
                    await this.environment!.write(
                        configured.domain + configured.path,
                        before.revision,
                    );
                    return 'synced' as const;
                },
                { maxWait: 2000, timeout: 10000 },
            );
            if (status === 'synced') this.invalidate();
            return status;
        } catch {
            return 'unavailable';
        }
    }
    async get(uuid: string) {
        const row = await this.prisma.subscriptionDomains.findUnique({
            where: { uuid },
            include: counts,
        });
        if (!row) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
        return this.model(row);
    }
    async save(uuid: string | undefined, input: SubscriptionDomainInput) {
        let restore:
            | { before: DomainEnvironmentSnapshot; after: DomainEnvironmentSnapshot }
            | undefined;
        try {
            const result = await this.prisma.$transaction(
                async (tx) => {
                    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
                    const current = uuid
                        ? await tx.subscriptionDomains.findUnique({
                              where: { uuid },
                              include: counts,
                          })
                        : null;
                    if (uuid && !current)
                        throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
                    if (!uuid && (await tx.subscriptionDomains.count()) >= 128)
                        throw new BadRequestException('SUBSCRIPTION_DOMAIN_LIMIT');
                    if (current?.isDefault && !input.isDefault)
                        throw new ConflictException('SUBSCRIPTION_DOMAIN_DEFAULT_REQUIRED');
                    if (current?._count.aliases && input.kind !== 'PRIMARY')
                        throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
                    let inheritedPath = input.path;
                    if (input.parentUuid) {
                        const parent = await tx.subscriptionDomains.findUnique({
                            where: { uuid: input.parentUuid },
                        });
                        if (!parent || parent.kind !== 'PRIMARY' || input.parentUuid === uuid)
                            throw new BadRequestException('SUBSCRIPTION_DOMAIN_PARENT');
                        inheritedPath ||= parent.path;
                    }
                    const isDefault =
                        input.isDefault || (!uuid && (await tx.subscriptionDomains.count()) === 0);
                    if (isDefault && input.kind !== 'PRIMARY')
                        throw new BadRequestException('SUBSCRIPTION_DOMAIN_PARENT');
                    if (isDefault)
                        await tx.subscriptionDomains.updateMany({
                            where: { isDefault: true },
                            data: { isDefault: false },
                        });
                    const data = { ...input, path: inheritedPath, isDefault };
                    const row = uuid
                        ? await tx.subscriptionDomains.update({
                              where: { uuid },
                              data,
                              include: counts,
                          })
                        : await tx.subscriptionDomains.create({ data, include: counts });
                    if (isDefault && (!current?.isDefault || current.domain !== data.domain || current.path !== data.path)) {
                        if (!this.environment)
                            throw new HttpExceptionWithErrorCodeType(
                                'SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE',
                                'SUBSCRIPTION_DOMAIN_ENV_UNAVAILABLE',
                                503,
                            );
                        const before = await this.environment.read();
                        const after = await this.environment.write(
                            data.domain + data.path,
                            before.revision,
                        );
                        restore = { before, after };
                    }
                    return this.model(row);
                },
                { maxWait: 2000, timeout: 10000 },
            );
            this.invalidate();
            return result;
        } catch (error) {
            if (restore && this.environment) {
                await this.environment
                    .write(restore.before.value, restore.after.revision)
                    .catch(() => {
                        this.logger.warn(
                            'Subscription domain environment rollback could not be confirmed',
                        );
                    });
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002')
                    throw new ConflictException('SUBSCRIPTION_DOMAIN_EXISTS');
                if (error.code === 'P2003')
                    throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
            }
            throw error;
        }
    }
    async remove(uuid: string) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
                const row = await tx.subscriptionDomains.findUnique({ where: { uuid } });
                if (!row) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
                if (row.isDefault)
                    throw new ConflictException('SUBSCRIPTION_DOMAIN_DEFAULT_REQUIRED');
                await tx.subscriptionDomains.delete({ where: { uuid } });
            });
            this.invalidate();
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003')
                throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
            throw error;
        }
    }
    private invalidate() {
        this.generation++;
        this.cache = undefined;
        this.pending = undefined;
    }
    private async registry() {
        if (this.cache && this.cache.until > Date.now()) return this.cache.rows;
        if (!this.pending) {
            const generation = this.generation;
            const pending = this.prisma.subscriptionDomains
                .findMany({ take: 128 })
                .then((rows) => {
                    if (generation === this.generation)
                        this.cache = { rows, until: Date.now() + 5000 };
                    return rows;
                })
                .finally(() => {
                    if (this.pending === pending) this.pending = undefined;
                });
            this.pending = pending;
        }
        return this.pending;
    }
    async resolveOrigin(origin: string | undefined) {
        const rows = await this.registry();
        if (!rows.length)
            return this.configuredDefault
                ? `https://${this.configuredDefault.domain}${this.configuredDefault.path}`
                : undefined;
        const selected = rows.find((row) => `https://${row.domain}` === origin);
        if (selected) return subscriptionDomainBase(selected);
        const main = rows.find((row) => row.isDefault);
        return main ? `https://${main.domain}${main.path}` : undefined;
    }

    async gatewayBase(uuid: string): Promise<string> {
        const rows = await this.registry();
        const domain = rows.find(row => row.uuid === uuid && row.kind === 'CDN');
        if (!domain || !rows.some(row => row.uuid === domain.parentUuid && row.kind === 'PRIMARY'))
            throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
        return subscriptionDomainBase(domain);
    }
}

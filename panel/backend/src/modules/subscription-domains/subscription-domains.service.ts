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
import type {
    ListSubscriptionDomainsCommand,
    GetUserDomainLinksCommand,
} from '@libs/contracts/commands';
import {
    MAX_CDN_PER_PRIMARY,
    SubscriptionDomainInput,
} from '@libs/contracts/models/subscription-domain.schema';

import { HttpExceptionWithErrorCodeType } from '../../common/exception/http-exeception-with-error-code.type';
import { cdnRequestHeaderName } from '../../common/utils/cdn-request-header';
import { configuredSubscriptionDomain } from '../../common/utils/public-subscription-domain';
import { isRestApi } from '../../common/utils/startup-app/is-development';
import {
    cdnRequestProof,
    decideDomainAccess,
    type DomainAccessRequest,
} from '../../common/utils/subscription-domain-access';
import { subscriptionDomainBase } from '../../common/utils/subscription-domain-url';
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
        return {
            ...data,
            publicBaseUrl: subscriptionDomainBase(row),
            requestHeaderName:
                row.kind === 'CDN'
                    ? cdnRequestHeaderName(row.uuid, this.config.getOrThrow('APP_SECRET'))
                    : null,
            usersCount: _count.users,
            aliasesCount: _count.aliases,
        };
    }
    async list(query: ListSubscriptionDomainsCommand.RequestQuery = {}) {
        return (
            await this.prisma.subscriptionDomains.findMany({
                where: {
                    ...(query.kind ? { kind: query.kind } : {}),
                    ...(query.parentUuid ? { parentUuid: query.parentUuid, kind: 'CDN' } : {}),
                },
                include: counts,
                orderBy: [{ isDefault: 'desc' }, { domain: 'asc' }],
                take: 128,
            })
        ).map((row) => this.model(row));
    }
    async listing(query: ListSubscriptionDomainsCommand.RequestQuery = {}) {
        const environment = await this.synchronizeEnvironment();
        return { response: await this.list(query), environment };
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
                        const sameParent =
                            current?.kind === 'CDN' && current.parentUuid === input.parentUuid;
                        if (
                            !sameParent &&
                            (await tx.subscriptionDomains.count({
                                where: { kind: 'CDN', parentUuid: input.parentUuid },
                            })) >= MAX_CDN_PER_PRIMARY
                        )
                            throw new HttpExceptionWithErrorCodeType(
                                'A primary domain can have at most one CDN domain',
                                'SUBSCRIPTION_DOMAIN_CDN_LIMIT',
                                400,
                            );
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
                    const previousAccess = current?.accessMode;
                    const accessMode =
                        input.accessMode ??
                        (input.kind === 'CDN' &&
                        !['OPEN', 'BLOCKED'].includes(previousAccess ?? 'OPEN')
                            ? 'OPEN'
                            : previousAccess) ??
                        'OPEN';
                    const redirectDomainUuid =
                        accessMode === 'REDIRECT'
                            ? (input.redirectDomainUuid ?? current?.redirectDomainUuid ?? null)
                            : null;
                    if (input.kind === 'PRIMARY' && accessMode === 'BLOCKED') {
                        const remaining = await tx.subscriptionDomains.count({
                            where: {
                                kind: 'PRIMARY',
                                accessMode: { not: 'BLOCKED' },
                                ...(uuid ? { uuid: { not: uuid } } : {}),
                            },
                        });
                        if (!remaining)
                            throw new ConflictException('SUBSCRIPTION_DOMAIN_LAST_PRIMARY');
                    }
                    if (accessMode === 'CDN_ONLY' || accessMode === 'REDIRECT') {
                        if (
                            !uuid ||
                            !(await tx.subscriptionDomains.count({
                                where: { parentUuid: uuid, kind: 'CDN' },
                            }))
                        )
                            throw new BadRequestException('SUBSCRIPTION_DOMAIN_ACCESS_INVALID');
                        if (redirectDomainUuid) {
                            const target = await tx.subscriptionDomains.findUnique({
                                where: { uuid: redirectDomainUuid },
                            });
                            if (
                                !target ||
                                target.kind !== 'CDN' ||
                                target.parentUuid !== uuid ||
                                target.accessMode === 'BLOCKED'
                            )
                                throw new BadRequestException('SUBSCRIPTION_DOMAIN_ACCESS_INVALID');
                        } else if (accessMode === 'REDIRECT')
                            throw new BadRequestException('SUBSCRIPTION_DOMAIN_ACCESS_INVALID');
                    }
                    if (
                        current?.kind === 'CDN' &&
                        (input.kind !== 'CDN' || input.parentUuid !== current.parentUuid)
                    ) {
                        if (
                            await tx.subscriptionDomains.count({
                                where: { redirectDomainUuid: uuid },
                            })
                        )
                            throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
                        const oldParent = current.parentUuid
                            ? await tx.subscriptionDomains.findUnique({
                                  where: { uuid: current.parentUuid },
                              })
                            : null;
                        if (
                            ['CDN_ONLY', 'REDIRECT'].includes(oldParent?.accessMode ?? '') &&
                            (await tx.subscriptionDomains.count({
                                where: { parentUuid: current.parentUuid, kind: 'CDN' },
                            })) <= 1
                        )
                            throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
                    }
                    const data = {
                        ...input,
                        path: inheritedPath,
                        isDefault,
                        accessMode,
                        redirectDomainUuid,
                    };
                    const row = uuid
                        ? await tx.subscriptionDomains.update({
                              where: { uuid },
                              data,
                              include: counts,
                          })
                        : await tx.subscriptionDomains.create({ data, include: counts });
                    if (
                        isDefault &&
                        (!current?.isDefault ||
                            current.domain !== data.domain ||
                            current.path !== data.path)
                    ) {
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
    async remove(uuid: string, options: { reassignUsers?: boolean } = {}) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
                const row = await tx.subscriptionDomains.findUnique({ where: { uuid } });
                if (!row) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
                if (await tx.subscriptionDomains.count({ where: { redirectDomainUuid: uuid } }))
                    throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
                if (row.kind === 'CDN' && row.parentUuid) {
                    const parent = await tx.subscriptionDomains.findUnique({
                        where: { uuid: row.parentUuid },
                    });
                    if (
                        ['CDN_ONLY', 'REDIRECT'].includes(parent?.accessMode ?? '') &&
                        (await tx.subscriptionDomains.count({
                            where: { parentUuid: row.parentUuid, kind: 'CDN' },
                        })) <= 1
                    )
                        throw new ConflictException('SUBSCRIPTION_DOMAIN_IN_USE');
                }
                if (row.isDefault)
                    throw new ConflictException('SUBSCRIPTION_DOMAIN_DEFAULT_REQUIRED');
                if (row.kind === 'PRIMARY' && row.accessMode !== 'BLOCKED') {
                    const remaining = await tx.subscriptionDomains.count({
                        where: {
                            kind: 'PRIMARY',
                            accessMode: { not: 'BLOCKED' },
                            uuid: { not: uuid },
                        },
                    });
                    if (!remaining) throw new ConflictException('SUBSCRIPTION_DOMAIN_LAST_PRIMARY');
                }
                if (options.reassignUsers) {
                    const fallback = await tx.subscriptionDomains.findFirst({
                        where: { isDefault: true, kind: 'PRIMARY', accessMode: { not: 'BLOCKED' } },
                    });
                    if (!fallback || fallback.uuid === uuid)
                        throw new ConflictException('SUBSCRIPTION_DOMAIN_DEFAULT_REQUIRED');
                    await tx.users.updateMany({
                        where: { subscriptionDomainUuid: uuid },
                        data: { subscriptionDomainUuid: null },
                    });
                }
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

    async access(input: DomainAccessRequest) {
        return decideDomainAccess(
            await this.registry(),
            input,
            this.config.getOrThrow('APP_SECRET'),
        );
    }
    async credentials(uuid: string) {
        await this.gatewayBase(uuid);
        return {
            requestHeaderName: cdnRequestHeaderName(uuid, this.config.getOrThrow('APP_SECRET')),
            requestHeaderValue:
                uuid + '.' + cdnRequestProof(uuid, this.config.getOrThrow('APP_SECRET')),
        };
    }
    async gatewayBase(uuid: string): Promise<string> {
        const rows = await this.registry();
        const domain = rows.find((row) => row.uuid === uuid && row.kind === 'CDN');
        if (
            !domain ||
            !rows.some((row) => row.uuid === domain.parentUuid && row.kind === 'PRIMARY')
        )
            throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
        return subscriptionDomainBase(domain);
    }

    async gatewayHeaderName(uuid: string): Promise<string> {
        await this.gatewayBase(uuid);
        return cdnRequestHeaderName(uuid, this.config.getOrThrow('APP_SECRET'));
    }

    async userLinks(
        assignedUuid: string | null | undefined,
        shortUuid: string,
        query: GetUserDomainLinksCommand.RequestQuery = {},
    ): Promise<GetUserDomainLinksCommand.Response['response']> {
        const rows = await this.registry();
        const assigned = assignedUuid ? rows.find((row) => row.uuid === assignedUuid) : undefined;
        if (assignedUuid && !assigned) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
        const primary = assigned
            ? assigned.kind === 'PRIMARY'
                ? assigned
                : rows.find((row) => row.uuid === assigned.parentUuid && row.kind === 'PRIMARY')
            : rows.find((row) => row.isDefault && row.kind === 'PRIMARY');
        if (!primary) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
        const cdns = rows
            .filter((row) => row.kind === 'CDN' && row.parentUuid === primary.uuid)
            .sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0));
        const family = [primary, ...cdns];
        const preferred =
            cdns.find((row) => row.accessMode !== 'BLOCKED' && row.uuid === assigned?.uuid) ??
            cdns.find(
                (row) => row.accessMode !== 'BLOCKED' && row.uuid === primary.redirectDomainUuid,
            ) ??
            cdns.find((row) => row.accessMode !== 'BLOCKED') ??
            primary;
        if (query.domainUuid) {
            const domain = family.find((row) => row.uuid === query.domainUuid);
            if (!domain) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
            if (query.kind && domain.kind !== query.kind)
                throw new BadRequestException('SUBSCRIPTION_DOMAIN_KIND_MISMATCH');
        }
        return {
            primaryDomainUuid: primary.uuid,
            links: family
                .filter(
                    (row) =>
                        primary.accessMode !== 'BLOCKED' &&
                        row.accessMode !== 'BLOCKED' &&
                        (row.kind !== 'PRIMARY' || !row.accessMode || row.accessMode === 'OPEN') &&
                        (!query.kind || row.kind === query.kind) &&
                        (!query.domainUuid || row.uuid === query.domainUuid),
                )
                .map((row) => ({
                    domainUuid: row.uuid,
                    name: row.name,
                    domain: row.domain,
                    kind: row.kind as 'PRIMARY' | 'CDN',
                    url: `${subscriptionDomainBase(row)}/${shortUuid}`,
                    isSelected: row.uuid === preferred.uuid,
                })),
        };
    }
}

import { Prisma, SubscriptionDomains } from '@prisma/client';

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';
import { publicGeofileOrigin } from '@common/utils/public-geofile-origin';
import { SubscriptionDomainInput } from '@libs/contracts/models/subscription-domain.schema';

const LOCK = 72626389;
const counts = { _count: { select: { users: true, aliases: true } } } as const;

function configuredDefaultDomain(value: string): { domain: string; path: string } | undefined {
    try {
        const url = new URL(`https://${value}`);
        if (url.port || url.search || url.hash || !publicGeofileOrigin(url.host)) return;
        const path = url.pathname === '/' ? '' : url.pathname;
        if (path && !/^\/(?:[a-z0-9._~-]+(?:\/[a-z0-9._~-]+)*)?$/i.test(path)) return;
        return { domain: url.hostname, path };
    } catch {
        return;
    }
}
@Injectable()
export class SubscriptionDomainsService implements OnModuleInit {
    private cache: { until: number; rows: SubscriptionDomains[] } | undefined;
    private pending: Promise<SubscriptionDomains[]> | undefined;
    private generation = 0;
    private readonly configuredDefault: { domain: string; path: string } | undefined;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: TypedConfigService,
    ) {
        this.configuredDefault = configuredDefaultDomain(
            this.config.getOrThrow('SUB_PUBLIC_DOMAIN'),
        );
    }

    async onModuleInit() {
        const configured = this.configuredDefault;
        if (!configured) return;
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
            if ((await tx.subscriptionDomains.count()) === 0) {
                await tx.subscriptionDomains.create({
                    data: {
                        domain: configured.domain,
                        path: configured.path,
                        name: configured.domain,
                        kind: 'PRIMARY',
                        isDefault: true,
                    },
                });
            }
        });
    }
    private model(row: SubscriptionDomains & { _count: { users: number; aliases: number } }) {
        const { _count, ...data } = row;
        return { ...data, usersCount: _count.users, aliasesCount: _count.aliases };
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
    async get(uuid: string) {
        const row = await this.prisma.subscriptionDomains.findUnique({
            where: { uuid },
            include: counts,
        });
        if (!row) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
        return this.model(row);
    }
    async save(uuid: string | undefined, input: SubscriptionDomainInput) {
        try {
            const result = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
                const current = uuid
                    ? await tx.subscriptionDomains.findUnique({ where: { uuid }, include: counts })
                    : null;
                if (uuid && !current) throw new NotFoundException('SUBSCRIPTION_DOMAIN_NOT_FOUND');
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
                return this.model(row);
            });
            this.invalidate();
            return result;
        } catch (error) {
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
        if (selected) return `https://${selected.domain}${selected.path}`;
        const main = rows.find((row) => row.isDefault);
        return main ? `https://${main.domain}${main.path}` : undefined;
    }
}

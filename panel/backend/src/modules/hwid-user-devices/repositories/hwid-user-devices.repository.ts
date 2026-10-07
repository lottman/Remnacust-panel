import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';

import { TxKyselyService } from '@common/database';
import { paginateQuery } from '@common/helpers';
import { ICrudWithStringId } from '@common/types/crud-port';

import { GetHwidDevicesQueryDto } from '../dtos';
import { HwidUserDeviceEntity } from '../entities/hwid-user-device.entity';
import { HwidUserDevicesConverter } from '../hwid-user-devices.converter';

const HWID_FILTER_COLUMN_MAP = {
    userId: sql`CAST(user_id AS TEXT)`,
    hwid: sql.ref('hwid_user_devices.hwid'),
    platform: sql.ref('hwid_user_devices.platform'),
    userAgent: sql.ref('hwid_user_devices.user_agent'),
    osVersion: sql.ref('hwid_user_devices.os_version'),
    deviceModel: sql.ref('hwid_user_devices.device_model'),
    requestIp: sql.ref('hwid_user_devices.request_ip'),
} as const;

type AllowedHwidFilterId = keyof typeof HWID_FILTER_COLUMN_MAP;

const HWID_LOCK_PREFIX = 900000000n;

@Injectable()
export class HwidUserDevicesRepository implements Omit<
    ICrudWithStringId<HwidUserDeviceEntity>,
    'deleteById' | 'findById' | 'update'
> {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly qb: TxKyselyService,
        private readonly converter: HwidUserDevicesConverter,
    ) {}

    public async registrationAllowed(userId: bigint): Promise<boolean> {
        const rows = await this.prisma.tx.$queryRaw<Array<{ allowed: boolean }>>`
            SELECT COALESCE(p.registration_allowed,true) AS allowed FROM users u
            LEFT JOIN xera_hwid_registration_policy p ON p.user_id=u.id WHERE u.id=${userId}`;
        if (!rows.length) throw new NotFoundException('User not found');
        return rows[0].allowed;
    }

    @Transactional()
    public async setRegistrationAllowed(userId: bigint, allowed: boolean): Promise<void> {
        await this.prisma.tx
            .$executeRaw`SELECT pg_advisory_xact_lock(${HWID_LOCK_PREFIX + userId})`;
        await this.registrationAllowed(userId);
        await this.prisma.tx
            .$executeRaw`INSERT INTO xera_hwid_registration_policy(user_id,registration_allowed)
            VALUES(${userId},${allowed}) ON CONFLICT(user_id) DO UPDATE
            SET registration_allowed=EXCLUDED.registration_allowed,updated_at=now()`;
    }

    public async create(entity: HwidUserDeviceEntity): Promise<HwidUserDeviceEntity> {
        const result = await this.createWithAdvisoryLock(entity, Number.MAX_SAFE_INTEGER);
        if (!result.hwidDevice) throw new ForbiddenException('New device registration is disabled');
        return result.hwidDevice;
    }

    @Transactional()
    public async upsert(entity: HwidUserDeviceEntity): Promise<HwidUserDeviceEntity> {
        // The same transaction lock serializes every write path with policy changes.
        const created = await this.createWithAdvisoryLock(entity, Number.MAX_SAFE_INTEGER);
        if (!created.hwidDevice)
            throw new ForbiddenException('New device registration is disabled');
        const result = await this.prisma.tx.hwidUserDevices.update({
            where: { hwid_userId: { hwid: entity.hwid, userId: entity.userId } },
            data: {
                platform: entity.platform,
                osVersion: entity.osVersion,
                deviceModel: entity.deviceModel,
                userAgent: entity.userAgent,
                requestIp: entity.requestIp,
                updatedAt: new Date(),
            },
        });
        return this.converter.fromPrismaModelToEntity(result);
    }

    public async findByCriteria(
        dto: Partial<HwidUserDeviceEntity>,
    ): Promise<HwidUserDeviceEntity[]> {
        const list = await this.prisma.tx.hwidUserDevices.findMany({
            where: dto,
            orderBy: {
                createdAt: 'desc',
            },
        });
        return this.converter.fromPrismaModelsToEntities(list);
    }

    public async findForConfig(
        userIds: bigint[],
    ): Promise<Array<{ userId: bigint; hwid: string; blocked: boolean }>> {
        const records: Array<{ userId: bigint; hwid: string; blocked: boolean }> = [];
        for (let offset = 0; offset < userIds.length; offset += 2000) {
            records.push(
                ...(await this.prisma.tx.hwidUserDevices.findMany({
                    where: { userId: { in: userIds.slice(offset, offset + 2000) } },
                    select: { userId: true, hwid: true, blocked: true },
                })),
            );
        }
        return records;
    }

    public async findFirstByCriteria(
        dto: Partial<HwidUserDeviceEntity>,
    ): Promise<HwidUserDeviceEntity | null> {
        const result = await this.prisma.tx.hwidUserDevices.findFirst({
            where: dto,
        });

        if (!result) {
            return null;
        }

        return this.converter.fromPrismaModelToEntity(result);
    }

    public async countByUserId(userId: bigint): Promise<number> {
        return await this.prisma.tx.hwidUserDevices.count({
            where: { userId },
        });
    }

    public async countCreatedInRange(start: Date, endExclusive: Date): Promise<number> {
        return await this.prisma.tx.hwidUserDevices.count({
            where: { createdAt: { gte: start, lt: endExclusive } },
        });
    }

    public async checkHwidExists(
        hwid: string,
        userId: bigint,
    ): Promise<{ exists: boolean; blocked: boolean }> {
        const result = await this.qb.kysely
            .selectNoFrom((eb) =>
                eb
                    .exists(
                        eb
                            .selectFrom('hwidUserDevices')
                            .select(sql`1`.as('one'))
                            .where('hwid', '=', hwid)
                            .where('userId', '=', userId),
                    )
                    .as('exists'),
            )
            .select((eb) =>
                eb
                    .selectFrom('hwidUserDevices')
                    .select('blocked')
                    .where('hwid', '=', hwid)
                    .where('userId', '=', userId)
                    .limit(1)
                    .as('blocked'),
            )
            .executeTakeFirstOrThrow();

        return { exists: !!result.exists, blocked: !!result.blocked };
    }

    public async deleteByHwidAndUserId(hwid: string, userId: bigint): Promise<boolean> {
        const result = await this.prisma.tx.hwidUserDevices.delete({
            where: { hwid_userId: { hwid, userId } },
        });
        return !!result;
    }

    public async blockByHwidAndUserId(
        hwid: string,
        userId: bigint,
        blocked: boolean,
    ): Promise<void> {
        const result = await sql`UPDATE hwid_user_devices SET blocked=${blocked},
            updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp())::timestamp,updated_at+interval '1 millisecond')
            WHERE hwid=${hwid} AND user_id=${userId} RETURNING hwid`.execute(this.qb.kysely);
        if (!result.rows.length) throw new NotFoundException('Device not found');
    }

    public async stageDeletion(
        userId: bigint,
        hwids: string[],
        includeBlocked = false,
    ): Promise<{ hwid: string; version: string }[]> {
        if (!hwids.length) return [];
        // Denial commits before network I/O. The version fences a concurrent administrator action.
        const result = await sql<{
            hwid: string;
            version: string;
        }>`UPDATE hwid_user_devices SET blocked=true,
            updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp())::timestamp,updated_at+interval '1 millisecond')
            WHERE user_id=${userId} AND hwid IN (${sql.join(hwids)}) AND (${includeBlocked} OR NOT blocked)
            RETURNING hwid,updated_at::text AS version`.execute(this.qb.kysely);
        return result.rows;
    }

    public async completeDeletion(
        userId: bigint,
        device: { hwid: string; version: string },
    ): Promise<boolean> {
        const result = await sql`DELETE FROM hwid_user_devices WHERE user_id=${userId}
            AND hwid=${device.hwid} AND blocked AND updated_at::text=${device.version}
            RETURNING hwid`.execute(this.qb.kysely);
        return result.rows.length === 1;
    }

    public async restoreDeletion(
        userId: bigint,
        device: { hwid: string; version: string },
        wasBlocked: boolean,
    ): Promise<boolean> {
        // Only undo our own staging write. A concurrent admin action wins.
        const result = await sql`UPDATE hwid_user_devices SET blocked=${wasBlocked},
            updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp())::timestamp,updated_at+interval '1 millisecond')
            WHERE user_id=${userId} AND hwid=${device.hwid} AND blocked
              AND updated_at::text=${device.version} RETURNING hwid`.execute(this.qb.kysely);
        return result.rows.length === 1;
    }

    public async deleteUnblockedByUserId(userId: bigint, hwids: string[]): Promise<boolean> {
        if (hwids.length === 0) return false;
        const result = await this.prisma.tx.hwidUserDevices.deleteMany({
            // Keep blocks even if an administrator blocks a device after the bulk request starts.
            // Restrict the deletion to the devices captured before node synchronization.
            where: { userId, blocked: false, hwid: { in: hwids } },
        });
        return result.count > 0;
    }

    public async getAllHwidDevices({
        start,
        size,
        filters,
        filterModes,
        sorting,
    }: GetHwidDevicesQueryDto): Promise<[HwidUserDeviceEntity[], number]> {
        let qb = this.qb.kysely.selectFrom('hwidUserDevices').selectAll();

        if (filters?.length) {
            qb = this.applyHwidFilters(qb, filters, filterModes);
        }

        if (sorting?.length) {
            for (const sort of sorting) {
                qb = qb.orderBy(sql.ref(sort.id), (ob) =>
                    (sort.desc ? ob.desc() : ob.asc()).nullsLast(),
                ) as typeof qb;
            }
        } else {
            qb = qb.orderBy('createdAt', 'desc');
        }

        const { rows, count } = await paginateQuery(qb, { offset: start, limit: size });

        return [rows.map((u) => new HwidUserDeviceEntity(u)), count];
    }

    private applyHwidFilters(
        qb: any,
        filters: GetHwidDevicesQueryDto['filters'],
        filterModes?: GetHwidDevicesQueryDto['filterModes'],
    ) {
        for (const filter of filters ?? []) {
            if (!(filter.id in HWID_FILTER_COLUMN_MAP)) continue;

            const column = HWID_FILTER_COLUMN_MAP[filter.id as AllowedHwidFilterId];
            const mode = filterModes?.[filter.id] ?? 'contains';

            if (filter.id === 'createdAt' || filter.id === 'expireAt') {
                qb = qb.where(column, '=', new Date(filter.value as string));
                continue;
            }

            if (filter.id === 'userId') {
                try {
                    BigInt(filter.value as string);
                    qb = qb.where(column, 'like', `%${filter.value}%`);
                } catch {
                    continue;
                }
                continue;
            }

            switch (mode) {
                case 'equals':
                    qb = qb.where(column, '=', filter.value);
                    break;
                case 'startsWith':
                    qb = qb.where(column, 'ilike', `${filter.value}%`);
                    break;
                case 'endsWith':
                    qb = qb.where(column, 'ilike', `%${filter.value}`);
                    break;
                default:
                    qb = qb.where(column, 'ilike', `%${filter.value}%`);
            }
        }

        return qb;
    }

    public async getHwidDevicesStats(): Promise<{
        byPlatform: {
            platform: string;
            count: number;
            byApp: { app: string; count: number }[];
        }[];
        stats: {
            totalUniqueDevices: number;
            totalHwidDevices: number;
            averageHwidDevicesPerUser: number;
        };
    }> {
        const platformAppStats = await this.qb.kysely
            .selectFrom('hwidUserDevices')
            .select([
                'platform',
                sql<string>`SPLIT_PART("user_agent", '/', 1)`.as('app'),
                (eb) => eb.fn.count('hwid').as('count'),
            ])
            .where('platform', 'is not', null)
            .where('userAgent', 'is not', null)
            .groupBy(['platform', sql`SPLIT_PART("user_agent", '/', 1)`])
            .execute();

        const totalStats = await this.qb.kysely
            .selectFrom('hwidUserDevices')
            .select([
                (eb) => eb.fn.count('hwid').as('totalHwidDevices'),
                (eb) => eb.fn.count(sql`DISTINCT hwid`).as('totalUniqueDevices'),
                (eb) => eb.fn.count(sql`DISTINCT "user_id"`).as('totalUsers'),
            ])
            .executeTakeFirstOrThrow();

        const platformMap = new Map<string, { count: number; apps: Map<string, number> }>();

        for (const row of platformAppStats) {
            const platform = row.platform || 'Unknown';
            const count = Number(row.count);

            let entry = platformMap.get(platform);
            if (!entry) {
                entry = { count: 0, apps: new Map() };
                platformMap.set(platform, entry);
            }

            entry.count += count;

            const app = row.app;
            if (!app.startsWith('https:')) {
                entry.apps.set(app, (entry.apps.get(app) ?? 0) + count);
            }
        }

        const byPlatform = Array.from(platformMap.entries())
            .map(([platform, entry]) => ({
                platform,
                count: entry.count,
                byApp: Array.from(entry.apps.entries())
                    .map(([app, count]) => ({ app, count }))
                    .sort((a, b) => b.count - a.count),
            }))
            .sort((a, b) => b.count - a.count);

        let averageHwidDevicesPerUser = 0;
        if (Number(totalStats.totalUsers) > 0) {
            averageHwidDevicesPerUser =
                Number(totalStats.totalHwidDevices) / Number(totalStats.totalUsers);
        }

        return {
            byPlatform,
            stats: {
                totalUniqueDevices: Number(totalStats.totalUniqueDevices),
                totalHwidDevices: Number(totalStats.totalHwidDevices),
                averageHwidDevicesPerUser: Math.round(averageHwidDevicesPerUser * 100) / 100,
            },
        };
    }

    public async getTopUsersByHwidDevices({ start, size }: { start: number; size: number }) {
        const query = this.qb.kysely
            .selectFrom('hwidUserDevices as d')
            .innerJoin('users as u', 'u.id', 'd.userId')
            .select(['u.id as id', 'u.username', (eb) => eb.fn.count('d.hwid').as('devicesCount')])
            .groupBy(['u.id', 'u.username'])
            .orderBy('devicesCount', 'desc')
            .orderBy('u.id', 'asc')
            .offset(start)
            .limit(size);

        const countQuery = this.qb.kysely
            .selectFrom('hwidUserDevices')
            .select((eb) => eb.fn.count(eb.fn('distinct', ['userId'])).as('count'))
            .executeTakeFirstOrThrow();

        const [users, { count }] = await Promise.all([query.execute(), countQuery]);

        return {
            users: users.map((u) => ({
                username: u.username,
                id: Number(u.id),
                devicesCount: Number(u.devicesCount),
            })),
            total: Number(count),
        };
    }

    @Transactional()
    public async createWithAdvisoryLock(
        entity: HwidUserDeviceEntity,
        deviceLimit: number,
    ): Promise<
        | {
              status: 'CREATED' | 'EXISTS';
              hwidDevice: HwidUserDeviceEntity;
          }
        | {
              status: 'LIMIT_REACHED' | 'REGISTRATION_BLOCKED';
              hwidDevice: null;
          }
    > {
        await this.prisma.tx
            .$executeRaw`SELECT pg_advisory_xact_lock(${HWID_LOCK_PREFIX + entity.userId})`;

        const existing = await this.prisma.tx.hwidUserDevices.findUnique({
            where: { hwid_userId: { hwid: entity.hwid, userId: entity.userId } },
        });

        if (existing) {
            return {
                status: 'EXISTS',
                hwidDevice: this.converter.fromPrismaModelToEntity(existing),
            };
        }

        if (!(await this.registrationAllowed(entity.userId)))
            return { status: 'REGISTRATION_BLOCKED', hwidDevice: null };

        const count = await this.prisma.tx.hwidUserDevices.count({
            where: { userId: entity.userId },
        });

        if (count >= deviceLimit) {
            return { status: 'LIMIT_REACHED', hwidDevice: null };
        }

        const result = await this.prisma.tx.hwidUserDevices.create({
            data: this.converter.fromEntityToPrismaModel(entity),
        });

        return { status: 'CREATED', hwidDevice: this.converter.fromPrismaModelToEntity(result) };
    }
}

const assert = require('node:assert/strict');
const { PrismaClient: Client } = require('@prisma/client');
const { PrismaClient } = require('./prisma-test-client.cjs');

(async () => {
    const raw = process.env.QUOTA_RESERVES_TEST_DATABASE_URL;
    assert.ok(raw);
    const target = new URL(raw);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55439');
    assert.equal(target.pathname, '/remnacust_quota_reserves_test');
    const esm = await import('@prisma/adapter-pg');
    for (const zone of [
        'UTC',
        'Asia/Tokyo',
        'Europe/Moscow',
        'America/New_York',
        'Asia/Kathmandu',
    ]) {
        const url = new URL(target);
        url.searchParams.set('options', '-c TimeZone=' + zone);
        for (const format of ['CJS', 'ESM']) {
            const prisma =
                format === 'CJS'
                    ? new PrismaClient({ datasourceUrl: url.href })
                    : new Client({
                          adapter: new esm.PrismaPg({ connectionString: url.href, max: 2 }),
                      });
            const rollback = new Error('ROLLBACK_TIMEZONE_FIXTURE');
            try {
                await assert.rejects(
                    prisma.$transaction(
                        async (tx) => {
                            assert.equal(
                                (await tx.$queryRaw`SELECT current_setting('TimeZone') AS zone`)[0]
                                    .zone,
                                zone,
                            );
                            for (const instant of [
                                new Date('2026-01-07T03:00:00.123Z'),
                                new Date('2026-07-07T03:00:00.456Z'),
                            ]) {
                                const [row] =
                                    await tx.$queryRaw`SELECT ${instant}::timestamptz AS zoned,${instant}::timestamp AS plain,
                            (extract(epoch FROM ${instant}::timestamptz)*1000)::bigint AS epoch,
                            ARRAY[${instant}::timestamptz,'9999-12-31 23:59:59+00'::timestamptz] AS zoned_array,
                            ARRAY[${instant}::timestamp] AS plain_array,
                            '2026-01-07 03:00:00.123456+00'::timestamptz AS precise`;
                                assert.equal(row.zoned.getTime(), instant.getTime());
                                assert.equal(row.plain.getTime(), instant.getTime());
                                assert.equal(row.epoch, BigInt(instant.getTime()));
                                assert.equal(row.zoned_array[0].getTime(), instant.getTime());
                                assert.equal(
                                    row.zoned_array[1].toISOString(),
                                    '9999-12-31T23:59:59.000Z',
                                );
                                assert.equal(row.plain_array[0].getTime(), instant.getTime());
                                assert.equal(row.precise.toISOString(), '2026-01-07T03:00:00.123Z');
                            }
                            const instant = new Date('2026-01-07T03:00:00.123Z');
                            const user = await tx.users.create({
                                data: {
                                    id: 9901n,
                                    username: 'timezone-fixture',
                                    shortUuid: 'timezone-fixture',
                                    expireAt: instant,
                                    trojanPassword: 'fixture',
                                    vlessUuid: '11111111-1111-4111-8111-111111111111',
                                    ssPassword: 'fixture',
                                },
                            });
                            const profile = await tx.configProfiles.create({
                                data: {
                                    name: 'timezone-fixture-profile',
                                    config: {},
                                    createdAt: instant,
                                },
                            });
                            const host = await tx.hosts.create({
                                data: {
                                    remark: 'timezone-fixture',
                                    address: 'example.invalid',
                                    port: 443,
                                    trafficLimitResetAnchorAt: instant,
                                    configProfileUuid: profile.uuid,
                                },
                            });
                            assert.equal(user.expireAt.getTime(), instant.getTime());
                            assert.equal(
                                host.trafficLimitResetAnchorAt.getTime(),
                                instant.getTime(),
                            );
                            const nested = await tx.configProfiles.findUniqueOrThrow({
                                where: { uuid: profile.uuid },
                                include: { hosts: true },
                            });
                            assert.equal(
                                nested.hosts[0].trafficLimitResetAnchorAt.getTime(),
                                instant.getTime(),
                            );
                            const reverse = await tx.hosts.findUniqueOrThrow({
                                where: { uuid: host.uuid },
                                include: { configProfiles: true },
                            });
                            assert.equal(
                                reverse.configProfiles.createdAt.getTime(),
                                instant.getTime(),
                            );
                            const [physical] = await tx.$queryRaw`SELECT
                        (SELECT (extract(epoch FROM expire_at AT TIME ZONE 'UTC')*1000)::bigint FROM users WHERE id=9901) AS plain_epoch,
                        (SELECT (extract(epoch FROM traffic_limit_reset_anchor_at)*1000)::bigint FROM hosts WHERE uuid=${host.uuid}::uuid) AS zoned_epoch,
                        (SELECT to_char(traffic_limit_reset_anchor_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM hosts WHERE uuid=${host.uuid}::uuid) AS utc_text`;
                            assert.equal(physical.plain_epoch, BigInt(instant.getTime()));
                            assert.equal(physical.zoned_epoch, BigInt(instant.getTime()));
                            assert.equal(physical.utc_text, instant.toISOString());
                            const [boundary] =
                                await tx.$queryRaw`SELECT xera_quota_window_end('2026-01-01 03:00:00+00',3,'DAYS','2026-01-04 03:00:00+00') AS boundary`;
                            assert.equal(
                                boundary.boundary.toISOString(),
                                '2026-01-07T03:00:00.000Z',
                            );
                            throw rollback;
                        },
                        { timeout: 15000 },
                    ),
                    (error) => error === rollback,
                );
                console.log(
                    'PASS real ' +
                        format +
                        ' ' +
                        zone +
                        ': raw/ORM timestamp and timestamptz, physical epoch, arrays, DST, sentinel and quota boundary',
                );
            } finally {
                await prisma.$disconnect();
            }
        }
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { source } = require('./upstream-filter-fixture.cjs');
const { SubscriptionTemplateRepository } = source(
    'modules/subscription-template/repositories/subscription-template.repository.ts',
    {
        '@nestjs-cls/transactional': {
            Transactional: () => (_target, _name, descriptor) => descriptor,
        },
    },
);
const converter = {
    fromEntityToPrismaModel: (value) => value,
    fromPrismaModelToEntity: (value) => value,
};
async function main() {
    const url = process.env.TEMPLATE_HISTORY_TEST_DATABASE_URL;
    assert(url, 'Use a dedicated loopback test database');
    const target = new URL(url);
    assert(
        ['127.0.0.1', 'localhost'].includes(target.hostname) && target.port === '55439',
        'Dedicated test database only',
    );
    const db = new PrismaClient({ datasourceUrl: url });
    const ids = [];
    const transaction = (action) =>
        db.$transaction((tx) => action(new SubscriptionTemplateRepository({ tx }, converter, {})), {
            timeout: 15000,
        });
    try {
        for (const type of ['XRAY_JSON', 'SINGBOX', 'CLASH', 'STASH', 'MIHOMO']) {
            const uuid = randomUUID();
            ids.push(uuid);
            const json = ['XRAY_JSON', 'SINGBOX'].includes(type);
            const initial = {
                uuid,
                name: 'history-test-' + uuid,
                templateType: type,
                tags: [],
                ...(json
                    ? { templateJson: { outbounds: [], routing: { balancers: [{ tag: 'old' }] } } }
                    : { templateYaml: '# saved comments\nproxies: []\n' }),
            };
            await transaction((repo) => repo.create(initial));
            for (let n = 1; n <= 34; n++)
                await transaction((repo) =>
                    repo.update({
                        uuid,
                        ...(json
                            ? {
                                  templateJson: {
                                      version: n,
                                      routing: { balancers: [{ tag: 'balance-' + n }] },
                                  },
                              }
                            : { templateYaml: `# version ${n}\nproxies: []\n` }),
                    }),
                );
            const versions = await transaction((repo) => repo.getRevisions(uuid));
            assert.equal(versions.length, 30);
            const restored = versions[10];
            await transaction((repo) =>
                repo.update({
                    uuid,
                    templateJson: json ? restored.templateJson : undefined,
                    templateYaml: json ? undefined : restored.templateYaml,
                }),
            );
            const current = await db.subscriptionTemplate.findUniqueOrThrow({ where: { uuid } });
            assert.deepEqual(current.templateJson, restored.templateJson);
            assert.equal(current.templateYaml, restored.templateYaml);
            assert.equal((await transaction((repo) => repo.getRevisions(uuid))).length, 30);
            const count = await db.subscriptionTemplateRevisions.count({
                where: { templateUuid: uuid },
            });
            await transaction((repo) => repo.update({ uuid }));
            assert.equal(
                await db.subscriptionTemplateRevisions.count({ where: { templateUuid: uuid } }),
                count,
                'No-op save should not add a revision',
            );
            const before = await transaction((repo) => repo.getRevisions(uuid));
            await assert.rejects(
                transaction(async (repo) => {
                    await repo.update({ uuid, name: 'rollback-test-' + uuid });
                    throw new Error('simulated failure');
                }),
                /simulated failure/,
            );
            assert.deepEqual(
                await transaction((repo) => repo.getRevisions(uuid)),
                before,
                'Failed transaction rolls back history and code',
            );
            const activeBeforeDraft = await db.subscriptionTemplate.findUniqueOrThrow({
                where: { uuid },
            });
            const incomplete = json ? '{ incomplete JSON' : 'proxy-groups: [';
            await transaction((repo) => repo.update({ uuid, draftContent: incomplete }));
            const savedDraft = await db.subscriptionTemplate.findUniqueOrThrow({ where: { uuid } });
            assert.equal(savedDraft.draftContent, incomplete);
            assert.deepEqual(savedDraft.templateJson, activeBeforeDraft.templateJson);
            assert.equal(savedDraft.templateYaml, activeBeforeDraft.templateYaml);
            const draftRevision = (await transaction((repo) => repo.getRevisions(uuid)))[0];
            assert.equal(draftRevision.draftContent, incomplete);
            await transaction((repo) => repo.update({ uuid, draftContent: null }));
            assert.equal(
                (await db.subscriptionTemplate.findUniqueOrThrow({ where: { uuid } })).draftContent,
                null,
            );
            console.log(
                `PASS ${type}: retention, full code restoration, deduplication and atomic rollback`,
            );
        }
        const uuid = ids[0];
        await Promise.all(
            Array.from({ length: 6 }, (_, n) =>
                transaction((repo) => repo.update({ uuid, templateJson: { concurrent: n } })),
            ),
        );
        const versions = await transaction((repo) => repo.getRevisions(uuid));
        assert.equal(versions.length, 30);
        assert.equal(
            new Set(versions.slice(0, 6).map((item) => item.templateJson.concurrent)).size,
            6,
        );
        const schema = 'template_upgrade_' + randomUUID().replaceAll('-', '');
        const marker = new Error('fixture rollback');
        try {
            await db.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
                await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
                await tx.$executeRawUnsafe(
                    'CREATE TABLE subscription_templates (uuid UUID PRIMARY KEY, name TEXT NOT NULL, template_json JSONB, template_yaml TEXT)',
                );
                await tx.$executeRaw`INSERT INTO subscription_templates VALUES (${uuid}::uuid, 'Existing', '{"manual":"keep"}'::jsonb, NULL)`;
                const sql = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../prisma/migrations/20261014010000_subscription_template_revisions/migration.sql',
                    ),
                    'utf8',
                );
                for (const statement of sql.split(';').filter((text) => text.trim()))
                    await tx.$executeRawUnsafe(statement);
                const rows = await tx.$queryRawUnsafe(
                    'SELECT template_json FROM subscription_template_revisions',
                );
                assert.deepEqual(rows, [{ template_json: { manual: 'keep' } }]);
                const draftSql = fs.readFileSync(
                    path.join(
                        __dirname,
                        '../prisma/migrations/20261023150000_subscription_template_drafts/migration.sql',
                    ),
                    'utf8',
                );
                for (const statement of draftSql.split(';').filter((text) => text.trim()))
                    await tx.$executeRawUnsafe(statement);
                assert.deepEqual(
                    await tx.$queryRawUnsafe('SELECT draft_content FROM subscription_templates'),
                    [{ draft_content: null }],
                );
                assert.deepEqual(
                    await tx.$queryRawUnsafe(
                        'SELECT draft_content FROM subscription_template_revisions',
                    ),
                    [{ draft_content: null }],
                );
                throw marker;
            });
        } catch (error) {
            if (error !== marker) throw error;
        }
        console.log('PASS concurrent saves and migration capture of existing code');
    } finally {
        await db.subscriptionTemplate.deleteMany({ where: { uuid: { in: ids } } });
        assert.equal(
            await db.subscriptionTemplateRevisions.count({ where: { templateUuid: { in: ids } } }),
            0,
            'Deletion cascades only this template history',
        );
        await db.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
require('reflect-metadata');
const load = require('./load-typescript.cjs');
const schema = load(path.join(__dirname, '../libs/contract/models/subscription-domain.schema.ts'));
const { SubscriptionDomainsService } = load(
    path.join(__dirname, '../src/modules/subscription-domains/subscription-domains.service.ts'),
    {
        '@common/config/app-config': {},
        '@common/database/prisma.service': {},
        '@libs/contracts/models/subscription-domain.schema': schema,
    },
);
const primary = {
    uuid: '11111111-1111-4111-8111-111111111111',
    name: 'Primary',
    domain: 'sub.example.test',
    path: '',
    kind: 'PRIMARY',
    parentUuid: null,
    isDefault: true,
    accessMode: 'REDIRECT',
    redirectDomainUuid: '22222222-2222-4222-8222-222222222222',
};
const cdn = {
    uuid: primary.redirectDomainUuid,
    name: 'CDN',
    domain: 'cdn.example.test',
    path: '',
    kind: 'CDN',
    parentUuid: primary.uuid,
    isDefault: false,
    accessMode: 'OPEN',
    redirectDomainUuid: null,
};
function fixture(data = [primary, cdn]) {
    const rows = data.map((row) => ({
        ...row,
        _count: { users: 0, aliases: data.filter((other) => other.parentUuid === row.uuid).length },
    }));
    let mutations = 0;
    const repository = {
        findMany: async () => rows,
        findUnique: async ({ where }) => rows.find((row) => row.uuid === where.uuid),
        count: async ({ where } = {}) =>
            rows.filter(
                (row) =>
                    !where || Object.entries(where).every(([key, value]) => row[key] === value),
            ).length,
        updateMany: async () => {},
        update: async ({ where, data }) => {
            mutations++;
            return Object.assign(
                rows.find((row) => row.uuid === where.uuid),
                data,
            );
        },
        delete: async () => {
            mutations++;
        },
    };
    const service = new SubscriptionDomainsService(
        {
            subscriptionDomains: repository,
            $transaction: async (action) =>
                action({ $executeRawUnsafe: async () => {}, subscriptionDomains: repository }),
        },
        { getOrThrow: (name) => (name === 'APP_SECRET' ? 'fixture-secret' : primary.domain) },
    );
    return { service, mutations: () => mutations };
}
const input = (row, extra = {}) =>
    schema.SubscriptionDomainInputSchema.parse({
        name: row.name,
        domain: row.domain,
        kind: row.kind,
        parentUuid: row.parentUuid,
        isDefault: row.isDefault,
        ...extra,
    });
test('older API clients cannot silently reset a protected domain on an unrelated edit', async () => {
    const { service } = fixture();
    const result = await service.save(primary.uuid, input(primary, { name: 'Renamed' }));
    assert.equal(result.accessMode, 'REDIRECT');
    assert.equal(result.redirectDomainUuid, cdn.uuid);
    assert.equal(result.requestHeaderValue, undefined);
});
test('redirect rejects targets from other families, absent targets and a PRIMARY before mutation', async () => {
    for (const target of [primary.uuid, '33333333-3333-4333-8333-333333333333']) {
        const f = fixture();
        await assert.rejects(
            f.service.save(
                primary.uuid,
                input(primary, { accessMode: 'REDIRECT', redirectDomainUuid: target }),
            ),
        );
        assert.equal(f.mutations(), 0);
    }
    const other = {
        ...cdn,
        uuid: '33333333-3333-4333-8333-333333333333',
        parentUuid: '44444444-4444-4444-8444-444444444444',
    };
    const f = fixture([primary, cdn, other]);
    await assert.rejects(
        f.service.save(
            primary.uuid,
            input(primary, { accessMode: 'REDIRECT', redirectDomainUuid: other.uuid }),
        ),
    );
    assert.equal(f.mutations(), 0);
});
test('the final CDN of a restricted primary cannot be deleted', async () => {
    const f = fixture();
    await assert.rejects(f.service.remove(cdn.uuid));
    assert.equal(f.mutations(), 0);
});
test('a redirect target cannot be repurposed as a primary', async () => {
    const f = fixture();
    await assert.rejects(
        f.service.save(cdn.uuid, input({ ...cdn, kind: 'PRIMARY', parentUuid: null })),
    );
    assert.equal(f.mutations(), 0);
});
test('origin credentials are absent from ordinary domain reads and public lookup', async () => {
    const f = fixture();
    const list = await f.service.list();
    const proof = await f.service.credentials(cdn.uuid);
    assert.match(proof.requestHeaderValue, /^[a-f0-9-]{36}\.[a-f0-9]{64}$/);
    assert.ok(!JSON.stringify(list).includes(proof.requestHeaderValue));
    assert.equal(await f.service.gatewayBase(cdn.uuid), 'https://cdn.example.test');
    assert.equal(f.mutations(), 0);
});
test('private credential access requires write or explicit credential scope, never ordinary read/list', () => {
    const { Reflector } = require('@nestjs/core');
    const contracts = require('../libs/contract/build/backend');
    const { ScopesGuard } = load(
        path.join(__dirname, '../src/common/guards/scopes/scopes.guard.ts'),
        {
            '@common/decorators/scopes': {
                SCOPE_ENDPOINT: 'scope_endpoint',
                SCOPE_RESOURCE: 'scope_resource',
            },
            '@libs/contracts/constants': contracts,
        },
    );
    const handler = () => {},
        type = class {};
    Reflect.defineMetadata('scope_resource', 'subscription-domains', type);
    Reflect.defineMetadata(
        'scope_endpoint',
        contracts.GetSubscriptionDomainCredentialsCommand.endpointDetails,
        handler,
    );
    const guard = new ScopesGuard(new Reflector());
    for (const [scope, allowed] of [
        ['subscription-domains:read', false],
        ['subscription-domains:list', false],
        ['subscription-domains:write', true],
        ['subscription-domains:credentials', true],
        ['users:write', false],
    ]) {
        const context = {
            getHandler: () => handler,
            getClass: () => type,
            switchToHttp: () => ({
                getRequest: () => ({ user: { role: 'API', scopes: [scope] } }),
            }),
        };
        assert.equal(guard.canActivate(context), allowed, scope);
    }
});

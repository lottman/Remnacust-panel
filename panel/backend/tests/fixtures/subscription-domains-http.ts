import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CqrsModule, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { TypedConfigService } from '@common/config/app-config';
import { PrismaService } from '@common/database/prisma.service';
import { RawCacheService } from '@common/raw-cache';
import { adminSessionKey, createAdminSessionClaims } from '@common/utils/admin-session';
import { GetAdminByUsernameQuery } from '@modules/admin/queries/get-admin-by-username';
import { GetTokenByUuidQuery } from '@modules/api-tokens/queries/get-token-by-uuid';
import { JwtStrategy } from '@modules/auth/strategies/jwt.strategy';
import { SubscriptionDomainsModule } from '@modules/subscription-domains/subscription-domains.module';
import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';
import { ERRORS } from '@libs/contracts/constants/errors';
import { ZodValidationPipe } from 'nestjs-zod';

const secret = randomBytes(32).toString('hex');
const admin = { uuid: randomUUID(), username: 'domain_http_fixture', passwordHash: 'fixture-only' };
const claims = createAdminSessionClaims(admin, secret);
const sessions = new Set([adminSessionKey(claims.jti)]);
const tokens = new Map<string, { scopes: string[]; expireAt: Date | null }>();
const row = { uuid: randomUUID(), name: 'Subscription', domain: 'sub.example.test', path: '',
    kind: 'PRIMARY', isDefault: true, parentUuid: null, _count: { users: 0, aliases: 0 } };
const cdn = { ...row, uuid: randomUUID(), kind: 'CDN', isDefault: false, parentUuid: row.uuid, domain: 'cdn.example.test' };
const database = { subscriptionDomains: {
    count: async () => 1,
    findMany: async (args: { where?: { kind?: string; parentUuid?: string } } = {}) => [row, cdn].filter(domain =>
        (!args.where?.kind || domain.kind === args.where.kind) &&
        (!args.where?.parentUuid || domain.parentUuid === args.where.parentUuid)),
    findUnique: async () => row,
}, $executeRawUnsafe: async () => 0, $transaction: async (action: (tx: unknown) => unknown) => action(database) };

@QueryHandler(GetAdminByUsernameQuery)
class AdminLookup implements IQueryHandler<GetAdminByUsernameQuery> {
    async execute(query: GetAdminByUsernameQuery) {
        return { isOk: query.username === admin.username, response: admin };
    }
}
@QueryHandler(GetTokenByUuidQuery)
class TokenLookup implements IQueryHandler<GetTokenByUuidQuery> {
    async execute(query: GetTokenByUuidQuery) {
        return { isOk: tokens.has(query.uuid), response: tokens.get(query.uuid) };
    }
}
@QueryHandler(GetUserByUniqueFieldQuery)
class UserLookup {
    async execute(query: GetUserByUniqueFieldQuery) {
        return query.field.id === 1n || query.field.id === 2n
            ? { isOk: true, response: { shortUuid: 'fixture_key', subscriptionDomainUuid: query.field.id === 1n ? cdn.uuid : null,
                status: query.field.id === 1n ? 'ACTIVE' : 'FROZEN' } }
            : { isOk: false, ...ERRORS.USER_NOT_FOUND };
    }
}

// Only infrastructure is substituted. Controllers, guards, module imports,
// CQRS resolution, JWT verification and domain service execute as shipped.
@Global()
@Module({ providers: [
    { provide: PrismaService, useValue: database },
    { provide: TypedConfigService, useValue: { getOrThrow: (key: string) => key === 'APP_SECRET' ? secret : 'sub.example.test' } },
    { provide: RawCacheService, useValue: { exists: async (key: string) => sessions.has(key) } },
], exports: [PrismaService, TypedConfigService, RawCacheService] })
class Infrastructure {}
@Module({ imports: [Infrastructure, CqrsModule, SubscriptionDomainsModule], providers: [JwtStrategy, AdminLookup, TokenLookup, UserLookup] })
class Root {}

async function main() {
    const app = await NestFactory.create(Root, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    try {
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl();
        const jwt = new JwtService({ secret });
        const sign = (payload: Record<string, unknown>) => jwt.sign(payload, { expiresIn: 60 });
        const request = async (token?: string, browser = false, route = '/api/subscription-domains') => {
            const response = await fetch(base + route, { headers: {
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
                ...(browser ? { 'X-Remnawave-Client-Type': 'browser' } : {}),
            }, signal: AbortSignal.timeout(5000) });
            return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
        };
        assert.equal((await request()).status, 401);
        assert.equal((await request('invalid')).status, 401);
        const browserToken = sign({ uuid: admin.uuid, username: admin.username, role: 'ADMIN', ...claims });
        assert.equal((await request(browserToken)).status, 403);
        const result = await request(browserToken, true);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.response[0].domain, row.domain);
        assert.equal(result.cache, 'no-store');
        sessions.clear();
        assert.equal((await request(browserToken, true)).status, 401);
        const uuid = randomUUID();
        const apiToken = sign({ uuid, role: 'API' });
        tokens.set(uuid, { scopes: [], expireAt: new Date(Date.now() + 60000) });
        assert.equal((await request(apiToken)).status, 403);
        tokens.set(uuid, { scopes: ['subscription-domains:read'], expireAt: new Date(Date.now() + 60000) });
        assert.equal((await request(apiToken)).status, 200);
        const filtered = await request(apiToken, false, '/api/subscription-domains?kind=CDN&parentUuid=' + row.uuid);
        assert.deepEqual(filtered.body.response.map((domain: { uuid: string }) => domain.uuid), [cdn.uuid]);
        assert.equal((await request(apiToken, false, '/api/subscription-domains?kind=PRIMARY&parentUuid=' + row.uuid)).status, 400);
        const linksRoute = '/api/users/1/subscription-links';
        assert.equal((await request(undefined, false, linksRoute)).status, 401);
        assert.equal((await request(apiToken, false, linksRoute)).status, 403, 'catalog access does not disclose user keys');
        for (const [scope, suffix, expectedKind] of [
            ['users:subscription-links-primary', '/primary', 'PRIMARY'],
            ['users:subscription-links-cdn', '/cdn', 'CDN'],
        ]) {
            tokens.set(uuid, { scopes: [scope], expireAt: null });
            const allowed = await request(apiToken, false, linksRoute + suffix);
            assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
            assert.equal(allowed.cache, 'private, no-store');
            assert.equal(allowed.body.response.links.length, 1);
            assert.equal(allowed.body.response.links[0].kind, expectedKind);
            assert.deepEqual(Object.keys(allowed.body.response.links[0]).sort(), ['domain', 'domainUuid', 'isSelected', 'kind', 'name', 'url']);
            assert.equal((await request(apiToken, false, linksRoute)).status, 403);
            assert.equal((await request(apiToken, false, linksRoute + '?kind=' + expectedKind)).status, 403);
            assert.equal((await request(apiToken, false, linksRoute + (suffix === '/primary' ? '/cdn' : '/primary'))).status, 403);
            assert.equal((await request(apiToken, false, linksRoute + suffix + '?kind=' + (expectedKind === 'CDN' ? 'PRIMARY' : 'CDN'))).status, 400);
        }
        tokens.set(uuid, { scopes: ['users:subscription-links'], expireAt: null });
        const links = await request(apiToken, false, linksRoute);
        assert.equal(links.status, 200, JSON.stringify(links.body));
        assert.equal(links.body.response.links.length, 2);
        assert.equal(links.body.response.links.find((link: { isSelected: boolean }) => link.isSelected).domainUuid, cdn.uuid);
        assert.equal((await request(apiToken, false, linksRoute + '?domainUuid=' + randomUUID())).status, 404);
        assert.equal((await request(apiToken, false, linksRoute + '?kind=CDN&domainUuid=' + row.uuid)).status, 400);
        assert.equal((await request(apiToken, false, '/api/users/999/subscription-links')).status, 404);
        assert.equal((await request(apiToken, false, '/api/users/2/subscription-links')).status, 200, 'operators may retrieve a frozen user link; this grants no subscription access');
        assert.equal((await request(apiToken, false, '/api/users/invalid/subscription-links')).status, 400);
        tokens.set(uuid, { scopes: ['users:subscription-links'], expireAt: new Date(0) });
        assert.equal((await request(apiToken, false, linksRoute)).status, 403);
        tokens.set(uuid, { scopes: ['subscription-domains:read'], expireAt: new Date(Date.now() + 60000) });
        const relay = '/api/sub/domains/' + cdn.uuid + '/resolve';
        assert.equal((await request()).status, 401);
        const resolved = await request(undefined, false, relay);
        assert.equal(resolved.status, 200);
        assert.equal(resolved.body.response.publicBaseUrl, `https://cdn.example.test/cdn/${cdn.uuid}`);
        assert.match(resolved.body.response.requestHeaderName, /^X-[a-f0-9]{24}$/);
        assert.deepEqual(Object.keys(resolved.body.response).sort(), ['publicBaseUrl', 'requestHeaderName', 'uuid']);
        assert.equal((await request(undefined, false, '/api/sub/domains/' + row.uuid + '/resolve')).status, 404);
        assert.equal((await request(undefined, false, '/api/sub/domains/' + randomUUID() + '/resolve')).status, 404);
        tokens.set(uuid, { scopes: ['subscription-domains:read'], expireAt: new Date(0) });
        assert.equal((await request(apiToken)).status, 403);
        tokens.delete(uuid);
        assert.equal((await request(apiToken)).status, 403);
        console.log('PASS domain HTTP authentication and module injection');
    } finally {
        await app.close();
    }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

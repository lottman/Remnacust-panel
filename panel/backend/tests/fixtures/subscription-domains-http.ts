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

const secret = randomBytes(32).toString('hex');
const admin = { uuid: randomUUID(), username: 'domain_http_fixture', passwordHash: 'fixture-only' };
const claims = createAdminSessionClaims(admin, secret);
const sessions = new Set([adminSessionKey(claims.jti)]);
const tokens = new Map<string, { scopes: string[]; expireAt: Date | null }>();
const row = { uuid: randomUUID(), name: 'Subscription', domain: 'sub.example.test', path: '',
    kind: 'PRIMARY', isDefault: true, parentUuid: null, _count: { users: 0, aliases: 0 } };
const database = { subscriptionDomains: {
    count: async () => 1,
    findMany: async () => [row],
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

// Only infrastructure is substituted. Controllers, guards, module imports,
// CQRS resolution, JWT verification and domain service execute as shipped.
@Global()
@Module({ providers: [
    { provide: PrismaService, useValue: database },
    { provide: TypedConfigService, useValue: { getOrThrow: (key: string) => key === 'APP_SECRET' ? secret : 'sub.example.test' } },
    { provide: RawCacheService, useValue: { exists: async (key: string) => sessions.has(key) } },
], exports: [PrismaService, TypedConfigService, RawCacheService] })
class Infrastructure {}
@Module({ imports: [Infrastructure, CqrsModule, SubscriptionDomainsModule], providers: [JwtStrategy, AdminLookup, TokenLookup] })
class Root {}

async function main() {
    const app = await NestFactory.create(Root, { logger: false, abortOnError: false });
    app.setGlobalPrefix('api');
    try {
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl();
        const jwt = new JwtService({ secret });
        const sign = (payload: Record<string, unknown>) => jwt.sign(payload, { expiresIn: 60 });
        const request = async (token?: string, browser = false) => {
            const response = await fetch(base + '/api/subscription-domains', { headers: {
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

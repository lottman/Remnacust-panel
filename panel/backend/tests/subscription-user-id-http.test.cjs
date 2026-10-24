const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
require('reflect-metadata');
const { Controller, Get, Module, Param } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ZodValidationPipe } = require('nestjs-zod');
const commands = require('../libs/contract/build/backend/commands');
const load = require('./load-typescript.cjs');
const mocks = { '@libs/contracts/commands': commands };
const { GetConnectionKeysByUserIdParamDto } = load(path.join(__dirname,
    '../src/modules/subscription/dto/get-connection-keys-by-user-id.dto.ts'), mocks);
const { GetSubscriptionByIdParamDto } = load(path.join(__dirname,
    '../src/modules/subscription/dto/get-subscription-by-id.dto.ts'), mocks);

test('subscription ID DTOs reject fractional and unsafe IDs as HTTP 400 before BigInt conversion', async () => {
    let entered = 0;
    class Fixture {
        byId(params) { entered++; return { id: BigInt(params.userId).toString() }; }
        keys(params) { entered++; return { id: BigInt(params.userId).toString() }; }
    }
    Controller('api/subscriptions')(Fixture);
    for (const [method, route, dto] of [
        ['byId', 'by-id/:userId', GetSubscriptionByIdParamDto],
        ['keys', 'connection-keys/:userId', GetConnectionKeysByUserIdParamDto],
    ]) {
        Get(route)(Fixture.prototype, method, Object.getOwnPropertyDescriptor(Fixture.prototype, method));
        Param()(Fixture.prototype, method, 0);
        Reflect.defineMetadata('design:paramtypes', [dto], Fixture.prototype, method);
    }
    class Root {}
    Module({ controllers: [Fixture] })(Root);
    const app = await NestFactory.create(Root, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    try {
        for (const route of ['by-id', 'connection-keys']) {
            for (const value of ['1.5', '-1', '0', 'NaN', 'Infinity', '9007199254740992']) {
                assert.equal((await fetch(`${base}/api/subscriptions/${route}/${value}`)).status, 400, `${route}/${value}`);
            }
            assert.equal(entered, route === 'by-id' ? 0 : 1);
            const valid = await fetch(`${base}/api/subscriptions/${route}/16`);
            assert.equal(valid.status, 200);
            assert.deepEqual(await valid.json(), { id: '16' });
        }
    } finally { await app.close(); }
});

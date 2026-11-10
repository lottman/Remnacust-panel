const assert = require('node:assert/strict');
const test = require('node:test');
require('reflect-metadata');
const { Body, Controller, Module, Post } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, ApiBody } = require('@nestjs/swagger');
const { createZodDto, ZodValidationPipe, cleanupOpenApiDoc } = require('nestjs-zod');
const { z } = require('zod');
const {
    UpdateSubscriptionSettingsCommand,
} = require('../libs/contract/build/backend/commands/subscription-settings/update-subscription-settings.command');

test('Nest validation and OpenAPI preserve bounds, unions and private fields after the adapter update', async () => {
    class SettingsDto extends createZodDto(UpdateSubscriptionSettingsCommand.RequestBodySchema) {}
    class PolicyDto extends createZodDto(
        z.object({
            label: z.union([z.string(), z.number()]).nullable().optional(),
            action: z.discriminatedUnion('type', [
                z.object({ type: z.literal('allow'), host: z.string().min(1) }),
                z.object({ type: z.literal('deny'), reason: z.string().min(1) }),
            ]),
        }),
    ) {}
    let calls = 0;
    class Fixture {
        settings(body) {
            calls++;
            return body;
        }
        policy(body) {
            calls++;
            return body;
        }
    }
    Controller('compatibility')(Fixture);
    for (const [method, dto] of [
        ['settings', SettingsDto],
        ['policy', PolicyDto],
    ]) {
        const descriptor = Object.getOwnPropertyDescriptor(Fixture.prototype, method);
        Post(method)(Fixture.prototype, method, descriptor);
        Body()(Fixture.prototype, method, 0);
        ApiBody({ type: dto })(Fixture.prototype, method, descriptor);
        Reflect.defineMetadata('design:paramtypes', [dto], Fixture.prototype, method);
    }
    class Root {}
    Module({ controllers: [Fixture] })(Root);
    const app = await NestFactory.create(Root, { logger: false });
    app.useGlobalPipes(new ZodValidationPipe());
    try {
        const document = cleanupOpenApiDoc(
            SwaggerModule.createDocument(app, {
                openapi: '3.0.0',
                info: { title: 'Compatibility', version: '1' },
                paths: {},
            }),
        );
        const settings = document.components.schemas.SettingsDto;
        assert.equal(settings.properties.geofilesInlineRuleLimit.minimum, 1);
        assert.equal(settings.properties.geofilesInlineRuleLimit.maximum, 250000);
        const policy = document.components.schemas.PolicyDto;
        assert.equal(policy.properties.action.oneOf.length, 2);
        assert.equal(policy.properties.label.nullable, true);
        assert.deepEqual(policy.properties.label.anyOf, [{ type: 'string' }, { type: 'number' }]);
        await app.listen(0, '127.0.0.1');
        const base = await app.getUrl();
        const post = (route, body) =>
            fetch(`${base}/compatibility/${route}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        const uuid = '00000000-0000-4000-8000-000000000001';
        for (const value of [0, 250001, '20000', null]) {
            assert.equal(
                (await post('settings', { uuid, geofilesInlineRuleLimit: value })).status,
                400,
            );
        }
        assert.equal(
            (await post('policy', { action: { type: 'allow', reason: 'wrong variant' } })).status,
            400,
        );
        assert.equal(calls, 0);
        const payload = JSON.parse(
            `{"uuid":"${uuid}","geofilesInlineRuleLimit":250000,"__proto__":{"poisoned":true},"constructor":{"prototype":{"poisoned":true}}}`,
        );
        const response = await post('settings', payload);
        assert.equal(response.status, 201);
        assert.deepEqual(await response.json(), { uuid, geofilesInlineRuleLimit: 250000 });
        assert.equal(Object.prototype.poisoned, undefined);
        const allowed = await post('policy', {
            action: { type: 'allow', host: 'example.test', extra: 'strip' },
        });
        assert.equal(allowed.status, 201);
        assert.deepEqual(await allowed.json(), { action: { type: 'allow', host: 'example.test' } });
        assert.equal(calls, 2);
    } finally {
        await app.close();
    }
});

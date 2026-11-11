const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { DriverAdapterError } = require('@prisma/driver-adapter-utils');
const load = require('./load-typescript.cjs');
const root = path.join(__dirname, '../src');
const conflicts = load(path.join(root, 'modules/config-profiles/config-profile-conflict.ts'));
const { ERRORS } = load(path.join(__dirname, '../libs/contract/constants/errors/errors.ts'));
const result = load(path.join(root, 'common/types/result.type.ts'));
const { errorHandler } = load(path.join(root, 'common/helpers/error-handler.helper.ts'), {
    '@libs/contracts/constants/errors': { ERRORS },
});

function service() {
    const filename = path.join(root, 'modules/config-profiles/config-profile.service.ts');
    const mocks = {};
    for (const match of fs.readFileSync(filename, 'utf8').matchAll(/from '([^']+)'/g)) {
        if (/^(@common\/|@modules\/|@libs\/|@queue\/|\.)/.test(match[1])) mocks[match[1]] = {};
    }
    const { ConfigProfileService } = load(filename, {
        ...mocks,
        '@nestjs-cls/transactional': { Transactional: () => () => {} },
        '@common/types': result,
        '@common/helpers/xray-config': { XrayConfigValidationError: class extends Error {} },
        '@libs/contracts/constants/errors': { ERRORS },
        './config-profile-conflict': conflicts,
    });
    const instance = new ConfigProfileService(
        { getConfigProfileByUUID: async () => ({ uuid: 'profile' }) },
        {},
        {},
        {},
    );
    instance.logger = { error() {} };
    return instance;
}

test('actual installed Prisma driver errors retain tag/name conflict through profile save and HTTP mapping', async () => {
    for (const [model, field, index, table, expected] of [
        [
            'configProfileInbounds',
            'tag',
            'config_profile_inbounds_tag_key',
            'config_profile_inbounds',
            ERRORS.INBOUNDS_WITH_SAME_TAG_ALREADY_EXISTS,
        ],
        [
            'configProfiles',
            'name',
            'config_profiles_name_key',
            'config_profiles',
            ERRORS.CONFIG_PROFILE_NAME_ALREADY_EXISTS,
        ],
    ]) {
        for (const constraint of [{ index }, { fields: [field] }]) {
            const driver = {
                provider: 'postgres',
                adapterName: 'isolated-unique-probe',
                queryRaw: async () => {
                    throw new DriverAdapterError({
                        kind: 'UniqueConstraintViolation',
                        constraint,
                        table,
                        originalCode: '23505',
                        originalMessage: 'PRIVATE_DETAIL',
                    });
                },
                executeRaw: async () => 0,
                dispose: async () => {},
                getConnectionInfo: () => ({ supportsRelationJoins: true }),
            };
            const client = new PrismaClient({
                adapter: {
                    provider: 'postgres',
                    adapterName: driver.adapterName,
                    connect: async () => driver,
                },
            });
            let failure;
            try {
                const data =
                    model === 'configProfiles'
                        ? { name: 'test', config: {} }
                        : {
                              tag: 'test',
                              type: 'vless',
                              profileUuid: '00000000-0000-4000-8000-000000000001',
                          };
                await client[model].create({ data });
            } catch (error) {
                failure = error;
            } finally {
                await client.$disconnect();
            }
            assert.equal(failure?.code, 'P2002');
            assert.equal(conflicts.configProfileConflict(failure), field);
            const instance = service();
            instance.updateConfigProfileTransactional = async () => {
                throw failure;
            };
            const response = await instance.updateConfigProfile('profile', 'test');
            assert.equal(response.code, expected.code);
            assert.equal(response.httpCode, 409);
            assert.ok(!response.message.includes('PRIVATE_DETAIL'));
            assert.throws(
                () => errorHandler(response),
                (error) => error.errorCode === expected.code && error.getStatus() === 409,
            );
        }
    }
});

test('legacy metadata remains supported; unrelated constraints and arbitrary text do not become conflicts', () => {
    assert.equal(
        conflicts.configProfileConflict({
            code: 'P2002',
            meta: { modelName: 'ConfigProfiles', target: ['name'] },
        }),
        'name',
    );
    assert.equal(
        conflicts.configProfileConflict({
            code: 'P2002',
            meta: { modelName: 'ConfigProfileInbounds', target: ['tag'] },
        }),
        'tag',
    );
    assert.equal(
        conflicts.configProfileConflict({
            code: 'P2002',
            meta: { modelName: 'ConfigProfiles', target: ['tag'] },
        }),
        'tag',
    );
    assert.equal(
        conflicts.configProfileConflict({
            code: 'P2002',
            meta: {
                modelName: 'ConfigProfiles',
                driverAdapterError: {
                    cause: {
                        kind: 'UniqueConstraintViolation',
                        table: 'config_profile_inbounds',
                        constraint: { fields: ['tag'] },
                    },
                },
            },
        }),
        'tag',
    );
    for (const error of [
        null,
        { message: 'config_profiles_name_key' },
        { code: 'P2002', meta: { modelName: 'Users', target: ['name'] } },
        { code: 'P2002', meta: { modelName: 'ConfigProfiles', target: ['name', 'uuid'] } },
        { code: 'P2010', meta: { target: ['tag'] } },
    ]) {
        assert.equal(conflicts.configProfileConflict(error), undefined);
    }
});

test('every catalog failure preserves its HTTP status even when legacy codes collide', () => {
    for (const entry of Object.values(ERRORS)) {
        assert.throws(
            () => errorHandler(result.fail(entry)),
            (error) => error.errorCode === entry.code && error.getStatus() === entry.httpCode,
        );
    }
    assert.throws(
        () =>
            errorHandler({
                isOk: false,
                code: 'A089',
                message: ERRORS.INVALID_USER_STATUS_ERROR.message,
            }),
        (error) => error.getStatus() === 400,
    );
    assert.throws(
        () => errorHandler({ isOk: false, code: 'A089', message: 'unrecognized', httpCode: 200 }),
        (error) => error.getStatus() === 500,
    );
});

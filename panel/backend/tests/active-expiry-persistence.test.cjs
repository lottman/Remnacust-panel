const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { source } = require('./upstream-filter-fixture.cjs');
const root = path.join(__dirname, '..');
const contract = load(
    path.join(root, 'libs/contract/models/subscription-settings/custom-remarks.schema.ts'),
);
const built = require('../libs/contract/build/backend/models');
const constants = require('../libs/contract/build/backend/constants');
const custom = (label, activeExpiry) => ({
    ...contract.DEFAULT_SUBSCRIPTION_REMARKS,
    expiredUsers: [label],
    ...(activeExpiry === undefined ? {} : { activeExpiry }),
});
const rules = {
    rules: [
        {
            id: '10000000-0000-4000-8000-000000000001',
            enabled: true,
            daysBeforeExpiry: 3,
            scope: 'all',
            internalSquadUuids: [],
            externalSquadUuids: [],
            remarks: ['Soon', '{HOSTS}'],
        },
    ],
};
const transactional = { Transactional: () => (_target, _property, descriptor) => descriptor };
const { SubscriptionSettingsRepository } = load(
    path.join(
        root,
        'src/modules/subscription-settings/repositories/subscription-settings.repository.ts',
    ),
    { '@nestjs-cls/transactional': transactional },
);
const { ExternalSquadRepository } = load(
    path.join(root, 'src/modules/external-squads/repositories/external-squad.repository.ts'),
    {
        '@nestjs-cls/transactional': transactional,
        '@common/utils': { wrapDbNull: (value) => value },
        '@common/helpers': {},
        '@common/helpers/kysely/values': {},
        '../entities': {},
    },
);
const converter = {
    fromEntityToPrismaModel: (value) => value,
    fromPrismaModelToEntity: (value) => value,
};

for (const kind of ['global', 'external']) {
    function fixture(before = custom('Old', rules), onLock) {
        const state = {
            uuid: '10000000-0000-4000-8000-000000000002',
            customRemarks: before,
            geofilesEnabled: false,
            geofilesSystemEnabled: false,
            serveJsonAtBaseSubscription: false,
        };
        const events = [];
        const model = {
            findUniqueOrThrow: async () => {
                events.push('read');
                return structuredClone(state);
            },
            update: async ({ data }) => {
                events.push('write');
                for (const [key, value] of Object.entries(data))
                    if (value !== undefined) state[key] = value;
                return structuredClone(state);
            },
        };
        const tx = {
            subscriptionSettings: model,
            externalSquads: model,
            $queryRaw: async (sql) => {
                assert(sql.join('?').includes('FOR UPDATE'));
                events.push('lock');
                onLock?.(state);
                return [{ customRemarks: structuredClone(state.customRemarks) }];
            },
        };
        const repo =
            kind === 'global'
                ? new SubscriptionSettingsRepository({ tx }, converter)
                : new ExternalSquadRepository({ tx }, {}, converter);
        return { state, events, repo };
    }

    test(`${kind}: old client updates its own remarks without erasing saved active rules`, async () => {
        const f = fixture();
        const incoming = custom('Changed by old client');
        await f.repo.update({ uuid: f.state.uuid, customRemarks: incoming });
        assert.deepEqual(f.state.customRemarks.activeExpiry, rules);
        assert.deepEqual(f.state.customRemarks.expiredUsers, ['Changed by old client']);
        assert.equal(Object.hasOwn(incoming, 'activeExpiry'), false);
        assert.equal(f.events[0], 'lock');
        assert(f.events.indexOf('lock') < f.events.indexOf('write'));
    });

    test(`${kind}: explicit empty rules clear and explicit replacement stays authoritative`, async () => {
        const f = fixture();
        await f.repo.update({ uuid: f.state.uuid, customRemarks: custom('Clear', { rules: [] }) });
        assert.deepEqual(f.state.customRemarks.activeExpiry, { rules: [] });
        await f.repo.update({ uuid: f.state.uuid, customRemarks: custom('Replace', rules) });
        assert.deepEqual(f.state.customRemarks.activeExpiry, rules);
        await f.repo.update({ uuid: f.state.uuid });
        assert.deepEqual(f.state.customRemarks.activeExpiry, rules);
    });

    test(`${kind}: omitted field preserves a concurrent committed rule observed after acquiring the row lock`, async () => {
        const latest = { rules: [{ ...rules.rules[0], daysBeforeExpiry: 9 }] };
        const f = fixture(custom('Old', rules), (state) => {
            state.customRemarks = custom('Concurrent writer', latest);
        });
        await f.repo.update({ uuid: f.state.uuid, customRemarks: custom('Old client') });
        assert.deepEqual(f.state.customRemarks.activeExpiry, latest);
    });

    if (kind === 'external')
        test('external: null clears the whole override and a later legacy object does not inherit global rules', async () => {
            const f = fixture();
            await f.repo.update({ uuid: f.state.uuid, customRemarks: null });
            assert.equal(f.state.customRemarks, null);
            await f.repo.update({ uuid: f.state.uuid, customRemarks: custom('Local only') });
            assert.equal(Object.hasOwn(f.state.customRemarks, 'activeExpiry'), false);
        });
}

test('both update services validate nested active rules and retain legacy raw-proxy support separately', async () => {
    const { validateCustomRemarks } = load(
        path.join(root, 'src/common/utils/templates/validate-custom-remarks.ts'),
        {
            '@libs/contracts/models': built,
            '@libs/contracts/models/subscription-settings/custom-remarks.schema': contract,
        },
    );
    const dependencies = {
        '@common/types': {
            ok: (response) => ({ isOk: true, response }),
            fail: (error) => ({ isOk: false, ...error }),
        },
        '@libs/contracts/constants': constants,
        '@libs/contracts/constants/errors': constants,
    };
    const { SubscriptionSettingsService } = source(
        'modules/subscription-settings/subscription-settings.service.ts',
        {
            ...dependencies,
            '../../common/utils/templates/validate-custom-remarks': { validateCustomRemarks },
        },
    );
    const { ExternalSquadService } = source('modules/external-squads/external-squads.service.ts', {
        ...dependencies,
        '../../common/utils/templates/validate-custom-remarks': { validateCustomRemarks },
        './models/get-external-squad-by-uuid.response.model': {
            GetExternalSquadByUuidResponseModel: class {
                constructor(value) {
                    Object.assign(this, value);
                }
            },
        },
    });
    for (const Service of [SubscriptionSettingsService, ExternalSquadService]) {
        let writes = 0;
        const repo = {
            findByUUID: async () => ({ uuid: 'settings' }),
            getExternalSquadByUuid: async () => ({ uuid: 'settings', templates: [] }),
            update: async (value) => {
                writes++;
                return value;
            },
        };
        const service = Object.create(Service.prototype);
        Object.assign(service, {
            logger: {
                error(error) {
                    throw error;
                },
            },
            subscriptionSettingsRepository: repo,
            externalSquadRepository: repo,
            rawCacheService: { del: async () => {}, invalidateTemplateSnapshots: async () => {} },
            squadsQueueService: {},
        });
        const update = (remarks) =>
            Service === SubscriptionSettingsService
                ? service.updateSettings({ uuid: 'settings', customRemarks: remarks })
                : service.updateExternalSquad({ uuid: 'settings', customRemarks: remarks });
        const valid = custom('Saved', rules);
        const result = await update(valid);
        assert.equal(result.isOk, true);
        assert.equal(writes, 1);
        for (const activeExpiry of [
            { rules: [{ ...rules.rules[0], daysBeforeExpiry: 0 }] },
            {
                rules: [
                    {
                        ...rules.rules[0],
                        remarks: ['{"finalRemark":"Proxy","address":"private.example.test"}'],
                    },
                ],
            },
        ]) {
            const invalid = await update(custom('Invalid', activeExpiry));
            assert.equal(invalid.isOk, false);
            assert.equal(writes, 1);
        }
    }
});

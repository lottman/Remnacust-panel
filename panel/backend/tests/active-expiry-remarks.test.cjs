const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const root = path.join(__dirname, '..');
const contract = load(
    path.join(root, 'libs/contract/models/subscription-settings/custom-remarks.schema.ts'),
);
const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rule = (overrides = {}) => ({
    id: uuid(1),
    enabled: true,
    daysBeforeExpiry: 3,
    scope: 'all',
    internalSquadUuids: [],
    externalSquadUuids: [],
    remarks: ['Expires soon', '{HOSTS}'],
    ...overrides,
});
const settings = (rules) => ({
    ...contract.DEFAULT_SUBSCRIPTION_REMARKS,
    ...(rules === undefined ? {} : { activeExpiry: { rules } }),
});

test('active expiry contract retains explicit rules, omission and explicit clear intent', () => {
    assert.deepEqual(contract.CustomRemarksSchema.parse(settings([rule()])).activeExpiry, {
        rules: [rule()],
    });
    assert.equal(
        Object.hasOwn(contract.CustomRemarksSchema.parse(settings()), 'activeExpiry'),
        false,
    );
    assert.deepEqual(contract.CustomRemarksSchema.parse(settings([])).activeExpiry, { rules: [] });
});

test('active expiry contract rejects invalid windows, scope, duplicate IDs and resource excess', () => {
    for (const value of [
        [rule({ daysBeforeExpiry: 0 })],
        [rule({ daysBeforeExpiry: 3651 })],
        [rule({ daysBeforeExpiry: 1.5 })],
        [rule({ scope: 'selected' })],
        [rule({ internalSquadUuids: ['invalid'] })],
        [rule(), rule()],
        [rule({ remarks: Array(25).fill('note') })],
        [rule({ remarks: ['x'.repeat(501)] })],
        [rule({ internalSquadUuids: Array.from({ length: 129 }, (_, i) => uuid(i + 100)) })],
        Array.from({ length: 33 }, (_, i) => rule({ id: uuid(i + 100) })),
    ])
        assert.equal(
            contract.CustomRemarksSchema.safeParse(settings(value)).success,
            false,
            JSON.stringify(value).slice(0, 100),
        );
});

test('active expiry contract accepts only standalone hosts, plain text and safe HTTPS actions', () => {
    const action = {
        type: 'link',
        text: 'Renew {{USERNAME}}',
        buttonText: 'Renew',
        url: 'https://example.test/renew?name={{USERNAME}}',
    };
    assert(
        contract.CustomRemarksSchema.safeParse(
            settings([
                rule({ remarks: ['{{USERNAME}} expires', JSON.stringify(action), '{HOSTS}'] }),
            ]),
        ).success,
    );
    for (const remarks of [
        ['{HOSTS}', '{HOSTS}'],
        ['Inline {HOSTS}'],
        ['{{FREE_HOST}}'],
        [JSON.stringify({ finalRemark: 'Injected', address: 'secret.example.test', port: 443 })],
        [JSON.stringify({ ...action, url: 'http://example.test' })],
        [JSON.stringify({ ...action, url: 'https://user:password@example.test' })],
        [JSON.stringify({ ...action, outbounds: [] })],
    ])
        assert.equal(
            contract.CustomRemarksSchema.safeParse(settings([rule({ remarks })])).success,
            false,
            JSON.stringify(remarks),
        );
});

const {
    selectActiveExpiryPlan,
    boundPresentationItems,
    boundActivePresentationItems,
    presentationBudget,
    boundSubscriptionHeaders,
    serializedHeaderBytes,
    MAX_SUBSCRIPTION_HEADER_BYTES,
} = load(path.join(root, 'src/modules/subscription/utils/active-expiry-remarks.ts'), {
    '@libs/contracts/models/subscription-settings/custom-remarks.schema': contract,
});
const now = Date.UTC(2026, 10, 14);
const user = (remaining, overrides = {}) => ({
    status: 'ACTIVE',
    expireAt: new Date(now + remaining),
    externalSquadUuid: null,
    ...overrides,
});
const choose = (u, rules, members = async () => []) =>
    selectActiveExpiryPlan(
        u,
        { isShowCustomRemarks: true, customRemarks: settings(rules) },
        members,
        now,
    );

test('active expiry uses exact inclusive day windows and strictly future expiry', async () => {
    for (const [remaining, expected] of [
        [-1, false],
        [0, false],
        [1, true],
        [3 * 86400000, true],
        [3 * 86400000 + 1, false],
        [4 * 86400000 - 1, false],
    ]) {
        assert.equal(!!(await choose(user(remaining), [rule()])), expected, String(remaining));
    }
    for (const status of ['EXPIRED', 'DISABLED', 'FROZEN', 'LIMITED'])
        assert.equal(await choose(user(1, { status }), [rule()]), null);
    assert.equal(await choose(user(1, { expireAt: new Date('invalid') }), [rule()]), null);
    assert.equal(
        await selectActiveExpiryPlan(
            user(1),
            { isShowCustomRemarks: false, customRemarks: settings([rule()]) },
            () => assert.fail('membership'),
            now,
        ),
        null,
    );
});

test('closest applicable window wins and saved list order breaks equal-window ties', async () => {
    const rules = [
        rule({ id: uuid(10), daysBeforeExpiry: 10 }),
        rule({ id: uuid(20), daysBeforeExpiry: 2 }),
        rule({ id: uuid(21), daysBeforeExpiry: 2 }),
    ];
    assert.equal((await choose(user(86400000), rules)).ruleId, uuid(20));
    rules[1].enabled = false;
    assert.equal((await choose(user(86400000), rules)).ruleId, uuid(21));
    assert.equal((await choose(user(3 * 86400000), rules)).ruleId, uuid(10));
});

test('selected scope matches any authoritative internal OR external membership lazily', async () => {
    let calls = 0;
    const members = async () => {
        calls++;
        return [uuid(101), uuid(102)];
    };
    const selected = rule({
        scope: 'selected',
        internalSquadUuids: [uuid(102)],
        externalSquadUuids: [uuid(201)],
    });
    assert.equal(
        (await choose(user(1, { externalSquadUuid: uuid(201) }), [selected], members)).ruleId,
        selected.id,
    );
    assert.equal(calls, 0);
    assert.equal((await choose(user(1), [selected], members)).ruleId, selected.id);
    assert.equal(calls, 1);
    assert.equal(await choose(user(1), [selected], async () => [uuid(999)]), null);
    assert.equal(
        (await choose(user(1), [rule()], () => assert.fail('all scope must not fetch membership')))
            .ruleId,
        uuid(1),
    );
    assert.equal(
        await choose(user(10 * 86400000), [selected], () => assert.fail('outside window')),
        null,
    );
});

test('membership is fetched at most once, unknown membership fails closed, old JSON is unchanged', async () => {
    let calls = 0;
    const rules = [
        rule({
            id: uuid(1),
            scope: 'selected',
            internalSquadUuids: [uuid(101)],
            daysBeforeExpiry: 1,
        }),
        rule({
            id: uuid(2),
            scope: 'selected',
            internalSquadUuids: [uuid(102)],
            daysBeforeExpiry: 2,
        }),
    ];
    assert.equal(
        (
            await choose(user(1), rules, async () => {
                calls++;
                return [uuid(102)];
            })
        ).ruleId,
        uuid(2),
    );
    assert.equal(calls, 1);
    await assert.rejects(
        choose(user(1), rules, async () => {
            throw new Error('membership unavailable');
        }),
        /membership unavailable/,
    );
    assert.equal(await choose(user(1), undefined, () => assert.fail('old settings')), null);
    assert.equal(await choose(user(1), [], () => assert.fail('cleared settings')), null);
});

test('header byte budget preserves the hosts marker and never adds one to notes-only plans', () => {
    const items = [
        ...Array.from({ length: 23 }, () => ({ kind: 'text', text: '界'.repeat(500) })),
        { kind: 'hosts' },
    ];
    const bounded = boundPresentationItems(items);
    assert(Buffer.byteLength(JSON.stringify(bounded)) <= 4500);
    assert.deepEqual(
        bounded.filter((item) => item.kind === 'hosts'),
        [{ kind: 'hosts' }],
    );
    assert.equal(items.length, 24);
    assert(boundPresentationItems(items.slice(0, 23)).every((item) => item.kind === 'text'));
});

test('notes-only compaction retains well-formed Unicode text within its encoded budget', () => {
    const result = boundActivePresentationItems([{ kind: 'text', text: '😀'.repeat(200) }], 128);
    assert.equal(result.length, 1);
    assert.equal(result[0].kind, 'text');
    assert(result[0].text.isWellFormed());
    assert(result[0].text.endsWith('…'));
    assert(Buffer.from(JSON.stringify(result)).toString('base64').length <= 128);
});

test('aggregate header budget removes optional actions whole and rejects oversized required fields', () => {
    const action = Buffer.from(
        JSON.stringify({
            text: 'Renew',
            buttonText: 'Open',
            url: 'https://example.test/' + 'x'.repeat(100),
        }),
    ).toString('base64');
    const headers = {
        'profile-title': 'x'.repeat(MAX_SUBSCRIPTION_HEADER_BYTES - 100),
        'X-Era-Subscription-Action': action,
    };
    const budget = presentationBudget(headers, false);
    assert.equal(budget.omitGlobalAction, true);
    assert(budget.presentationBytes > 0);
    boundSubscriptionHeaders(headers);
    assert.equal(headers['X-Era-Subscription-Action'], undefined);
    assert(serializedHeaderBytes(headers) <= MAX_SUBSCRIPTION_HEADER_BYTES);
    assert.throws(
        () => boundSubscriptionHeaders({ routing: 'x'.repeat(MAX_SUBSCRIPTION_HEADER_BYTES) }),
        /response budget/,
    );
});

test('active header compaction retains a configured warning and marker in either order', () => {
    for (const markerFirst of [false, true]) {
        const marker = { kind: 'hosts' };
        const notice = { kind: 'text', text: '界'.repeat(500) };
        const input = markerFirst ? [marker, notice] : [notice, marker];
        const result = boundActivePresentationItems(input, 128);
        assert.equal(result.length, 2);
        assert.equal(
            result.findIndex((item) => item.kind === 'hosts'),
            markerFirst ? 0 : 1,
        );
        assert(result.some((item) => item.kind === 'text' && item.text.length > 0));
        assert(Buffer.from(JSON.stringify(result)).toString('base64').length <= 128);
    }
});

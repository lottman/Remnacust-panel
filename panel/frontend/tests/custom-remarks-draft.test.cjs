const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const load = require('../../backend/tests/load-typescript.cjs');
const contract = load(path.join(__dirname, '../../backend/libs/contract/models/subscription-settings/custom-remarks.schema.ts'));
const utils = load(path.join(__dirname, '../src/shared/ui/forms/custom-remarks/remarks-editor.utils.ts'), {
    '@remnawave/backend-contract': contract,
});
const id = '10000000-0000-4000-8000-000000000001';
const internalId = '10000000-0000-4000-8000-000000000002';
const externalId = '10000000-0000-4000-8000-000000000003';
const base = () => ({ ...utils.defaultRemarks(), expiredUsers: ['Saved'], activeExpiry: { rules: [utils.newExpiryRule(id, 'Only {{DAYS_LEFT}} days left')] } });
const edit = (state, text) => utils.remarksDraftReducer(state, { type: 'edit', value: { ...state.draft, expiredUsers: [text] } });

test('new rules preserve VPN connections and use the actual agreed backend schema', () => {
    const rule = utils.newExpiryRule(id, 'Only {{DAYS_LEFT}} days left');
    assert.deepEqual(rule.remarks, ['Only {{DAYS_LEFT}} days left', '{HOSTS}']);
    assert.equal(contract.ActiveExpiryRuleSchema.safeParse(rule).success, true);
    for (const daysBeforeExpiry of [1, 3650])
        assert.equal(contract.ActiveExpiryRuleSchema.safeParse({ ...rule, daysBeforeExpiry }).success, true);
    for (const daysBeforeExpiry of [0, 3651, 1.5])
        assert.equal(contract.ActiveExpiryRuleSchema.safeParse({ ...rule, daysBeforeExpiry }).success, false);
});

test('frontend request and response contracts retain active rules instead of silently stripping them', () => {
    const value = base();
    for (const vendor of [
        require('../vendor/backend-contract/build/backend'),
        require('../vendor/backend-contract/build/frontend'),
        require('@remnawave/backend-contract'),
    ]) {
        assert.deepEqual(vendor.CustomRemarksSchema.parse(value).activeExpiry, value.activeExpiry);
        for (const command of [vendor.UpdateSubscriptionSettingsCommand, vendor.UpdateExternalSquadCommand]) {
            const parsed = command.RequestBodySchema.parse({ uuid: id, customRemarks: value });
            assert.deepEqual(parsed.customRemarks.activeExpiry, value.activeExpiry);
        }
    }
});

test('saving retains legacy text/order/actions and rule IDs, scopes and order', () => {
    const value = base();
    value.subscriptionAndHwidRemarkOrder.reverse();
    value.expiredUsers = [' Before ', '{{FREE_HOST}}', '{"type":"link","text":"Help","buttonText":"Open","url":"https://example.test"}', ''];
    value.activeExpiry.rules.push({ ...utils.newExpiryRule(externalId, 'Second'), scope: 'selected', internalSquadUuids: [internalId], externalSquadUuids: [externalId] });
    value.action = { text: 'Saved action', buttonText: 'Open', url: 'https://example.test' };
    const prepared = utils.prepareRemarks(value);
    assert.deepEqual(prepared.subscriptionAndHwidRemarkOrder, value.subscriptionAndHwidRemarkOrder);
    assert.deepEqual(prepared.expiredUsers, value.expiredUsers.slice(0, 3));
    assert.deepEqual(prepared.action, value.action);
    assert.deepEqual(prepared.activeExpiry, value.activeExpiry);
    assert.equal(value.expiredUsers.length, 4);
    assert.equal(contract.CustomRemarksSchema.safeParse(prepared).success, true);
});

test('notes-only is intentional; duplicate markers, raw proxies and unsafe actions cannot pass', () => {
    const rule = utils.newExpiryRule(id, 'Note');
    assert.equal(contract.ActiveExpiryRuleSchema.safeParse({ ...rule, remarks: ['Note'] }).success, true);
    for (const remarks of [
        ['{HOSTS}', '{HOSTS}'], ['prefix {HOSTS}'], ['{{FREE_HOST}}'],
        ['{"finalRemark":"Injected","address":"example.test","port":443}'],
        ['{"type":"link","text":"Help","buttonText":"Open","url":"http://example.test"}'],
        ['{"type":"link","text":"Help","buttonText":"Open","url":"https://user:pass@example.test"}'],
    ]) assert.equal(contract.ActiveExpiryRuleSchema.safeParse({ ...rule, remarks }).success, false);
    assert.equal(contract.ActiveExpiryRuleSchema.safeParse({ ...rule, scope: 'selected' }).success, false);
    for (const selection of [{ internalSquadUuids: [internalId] }, { externalSquadUuids: [externalId] }])
        assert.equal(contract.ActiveExpiryRuleSchema.safeParse({ ...rule, scope: 'selected', ...selection }).success, true);
});

test('equal refetches preserve dirty edits, including different object key order', () => {
    const value = base();
    const dirty = edit(utils.createRemarksDraft(value), 'Draft');
    const equal = Object.fromEntries(Object.entries(value).reverse());
    const synced = utils.remarksDraftReducer(dirty, { type: 'sync', value: equal });
    assert.deepEqual(synced.draft.expiredUsers, ['Draft']);
    assert.equal(utils.isRemarksDirty(synced), true);
    assert.equal(utils.hasRemoteRemarks(synced), false);
});

test('remote changes and failed saves preserve the draft; Reset loads the latest remote', () => {
    const dirty = edit(utils.createRemarksDraft(base()), 'Unsaved');
    const remote = { ...base(), expiredUsers: ['Changed elsewhere'] };
    const conflicted = utils.remarksDraftReducer(dirty, { type: 'sync', value: remote });
    assert.deepEqual(conflicted.draft.expiredUsers, ['Unsaved']);
    assert.equal(utils.hasRemoteRemarks(conflicted), true);
    assert.deepEqual(utils.draftValue(conflicted).expiredUsers, ['Unsaved']);
    const reset = utils.remarksDraftReducer(conflicted, { type: 'reset' });
    assert.deepEqual(reset.draft.expiredUsers, ['Changed elsewhere']);
    assert.equal(utils.isRemarksDirty(reset), false);
    assert.equal(utils.hasRemoteRemarks(reset), false);
    const cleanRefetch = utils.remarksDraftReducer(utils.createRemarksDraft(base()), { type: 'sync', value: remote });
    assert.deepEqual(cleanRefetch.draft.expiredUsers, ['Changed elsewhere']);
});

test('successful saves clear dirty state while edits made during a request remain', () => {
    const dirty = edit(utils.createRemarksDraft(base()), 'Submitted');
    const submitted = structuredClone(utils.draftValue(dirty));
    const saved = utils.remarksDraftReducer(dirty, { type: 'saved', submitted, value: submitted });
    assert.equal(utils.isRemarksDirty(saved), false);
    const newer = edit(dirty, 'Newer edit');
    const acknowledged = utils.remarksDraftReducer(newer, { type: 'saved', submitted, value: submitted });
    assert.deepEqual(acknowledged.draft.expiredUsers, ['Newer edit']);
    assert.deepEqual(acknowledged.baseline.expiredUsers, ['Submitted']);
    assert.equal(utils.isRemarksDirty(acknowledged), true);
});

test('external inheritance clones the complete global value; override toggles preserve its draft', () => {
    const inherited = base();
    let state = utils.createRemarksDraft(null, inherited);
    assert.equal(utils.draftValue(state), null);
    assert.equal(utils.isRemarksDirty(state), false);
    state = utils.remarksDraftReducer(state, { type: 'override', enabled: true });
    assert.deepEqual(utils.draftValue(state), inherited);
    assert.equal(utils.isRemarksDirty(state), true);
    state = edit(state, 'Squad draft');
    state = utils.remarksDraftReducer(state, { type: 'override', enabled: false });
    assert.equal(utils.draftValue(state), null);
    state = utils.remarksDraftReducer(state, { type: 'override', enabled: true });
    assert.deepEqual(state.draft.expiredUsers, ['Squad draft']);
    assert.deepEqual(inherited.expiredUsers, ['Saved']);
    state = utils.remarksDraftReducer(state, { type: 'reset', inherited });
    assert.equal(utils.draftValue(state), null);
    assert.deepEqual(state.draft, inherited);
});

test('loading, missing and failed squad-name queries retain every selected ID', () => {
    const selected = [internalId, externalId];
    assert.deepEqual(utils.squadOptions([], selected, id => 'Unavailable ' + id).map(option => option.value), selected);
    const loaded = utils.squadOptions([{ uuid: internalId, name: 'Team' }], selected, id => 'Unavailable ' + id);
    assert.equal(loaded[0].label, 'Team');
    assert.deepEqual(loaded.map(option => option.value), selected);
    assert.deepEqual(selected, [internalId, externalId]);
});

test('saving disabled override restores the current global copy for the next enable', () => {
    const oldOverride = { ...base(), expiredUsers: ['Old squad copy'] };
    const inherited = { ...base(), expiredUsers: ['Current global copy'] };
    let state = utils.createRemarksDraft(oldOverride, inherited);
    state = utils.remarksDraftReducer(state, { type: 'override', enabled: false });
    state = utils.remarksDraftReducer(state, { type: 'saved', value: null, submitted: null, inherited });
    state = utils.remarksDraftReducer(state, { type: 'override', enabled: true });
    assert.deepEqual(state.draft.expiredUsers, ['Current global copy']);
    assert.deepEqual(state.draft.activeExpiry, inherited.activeExpiry);
});

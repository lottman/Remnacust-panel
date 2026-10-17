const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const load = require('../../backend/tests/load-typescript.cjs');
const { ERRORS } = require('../../backend/libs/contract/build/backend/constants/errors/errors.js');

function messages(language) {
    const locale = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales', language, 'remnawave.json'), 'utf8'));
    return load(path.join(__dirname, '../src/shared/api/helpers/handler-request-error.ts'), {
        '@remnawave/backend-contract': { ERRORS },
        'consola/browser': { consola: { log() {} } },
        i18next: { t(key, options) {
            return key.split('.').reduce((value, part) => value?.[part], locale) ?? options?.defaultValue ?? key;
        } },
    });
}
test('duplicate node fields have localized, actionable messages in every supported language', () => {
    for (const language of ['ru', 'en', 'zh', 'fa']) {
        const { RequestError } = messages(language);
        for (const code of ['A033', 'A034']) {
            const error = new RequestError({ response: { status: 400, data: {
                errorCode: code, message: 'private-server-body-must-not-appear',
            } } });
            assert.equal(error.errorCode, code); assert.equal(error.status, 400);
            assert.ok(error.message.endsWith(`[${code}]`));
            assert.ok(!error.message.includes('private-server-body'));
            assert.ok(!error.message.includes('requestErrors.'));
            assert.ok(!error.message.includes('HTTP 400'));
        }
    }
});

test('unknown errors never surface arbitrary response bodies', () => {
    const { RequestError } = messages('ru');
    const error = new RequestError({ response: { status: 400, data: {
        errorCode: 'UNKNOWN_PRIVATE', message: 'private-server-body',
    } } });
    assert.ok(!error.message.includes('private-server-body'));
});

test('repeated create errors reuse one notification instead of stacking identical toasts', () => {
    const notifications = [];
    const command = { endpointDetails: {} };
    const contract = Object.fromEntries([
        'BulkNodesActionsCommand', 'BulkNodesProfileModificationCommand', 'BulkNodesUpdateCommand',
        'CreateNodeCommand', 'DeleteNodeCommand', 'DisableNodeCommand', 'EnableNodeCommand',
        'ReorderNodesCommand', 'ResetNodeTrafficCommand', 'RestartAllNodesCommand', 'RestartNodeCommand', 'UpdateNodeCommand',
    ].map(key => [key, command]));
    const hooks = load(path.join(__dirname, '../src/shared/api/hooks/nodes/nodes.mutation.hooks.ts'), {
        '@shared/utils/translate-mutation-message': { translateMutationMessage: value => value },
        '@mantine/notifications': { notifications: { show: value => notifications.push(value) } },
        '@remnawave/backend-contract': contract,
        i18next: { t: key => key },
        '../../tsq-helpers': { createMutationHook: config => config.rMutationParams },
    });
    hooks.useCreateNode.onError(new Error('duplicate'));
    hooks.useCreateNode.onError(new Error('duplicate'));
    assert.deepEqual(notifications.map(value => value.id), ['create-node-error', 'create-node-error']);
});

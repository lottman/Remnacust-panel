const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');
const messages = [];
const command = { endpointDetails: {} };
const hooks = load(path.join(__dirname, '../src/shared/api/hooks/backups/backups.mutation.hooks.ts'), {
    '@mantine/notifications': { notifications: { show: message => messages.push(message) } },
    '@remnawave/backend-contract': { DeleteBackupCommand: command, SendBackupCommand: command, UpdateBackupSettingsCommand: command },
    i18next: { t: key => key },
    '../../tsq-helpers': { createMutationHook: config => config.rMutationParams },
});
test('a failed Telegram delivery in a successful HTTP response is shown as a failure', () => {
    hooks.useSendBackup.onSuccess({ delivered: false });
    assert.equal(messages.at(-1).color, 'red');
    assert.equal(messages.at(-1).message, 'backups.delivery-failed');
    hooks.useSendBackup.onSuccess({ delivered: true });
    assert.equal(messages.at(-1).color, 'teal');
});
test('a rejected Telegram request is not silently discarded', () => {
    hooks.useSendBackup.onError(new Error('network unavailable'));
    assert.equal(messages.at(-1).color, 'red');
    assert.equal(messages.at(-1).message, 'backups.delivery-failed');
});

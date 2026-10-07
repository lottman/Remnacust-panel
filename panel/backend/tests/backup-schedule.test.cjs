const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = require('./load-typescript.cjs');

const { BackupsScheduledTask } = load(path.join(__dirname, '../src/scheduler/tasks/backups/backups-scheduled.task.ts'), {
    '@modules/backups/backups.service': {},
    '@scheduler/intervals': { JOBS_INTERVALS: { BACKUPS_CHECK: '0 */15 * * * *' } },
});

test('automatic backup stays off until enabled and manual copies do not delay it', async () => {
    let mode = 'OFF';
    const created = [];
    const service = {
        cleanup: async () => {},
        getSettings: async () => ({ isOk: true, response: { autoMode: mode, intervalHours: 24 } }),
        encryptionStatus: async () => ({ configured: true }),
        list: async () => ({ isOk: true, response: [
            { filename: 'remnawave-manual-recent.zip', createdAt: new Date() },
        ] }),
        create: async (scheduled) => created.push(scheduled),
    };
    const task = new BackupsScheduledTask(service);
    await task.handleCron();
    assert.deepEqual(created, []);
    mode = 'DAILY';
    await task.handleCron();
    assert.deepEqual(created, [true]);
});

test('configured interval applies to scheduled copies and blocks premature duplicates', async () => {
    let hours = 1;
    const created = [];
    const service = {
        cleanup: async () => {},
        getSettings: async () => ({ isOk: true, response: { autoMode: 'DAILY', intervalHours: hours } }),
        encryptionStatus: async () => ({ configured: true }),
        list: async () => ({ isOk: true, response: [
            { filename: 'remnawave-scheduled-prior.zip', createdAt: new Date(Date.now() - 2 * 3_600_000) },
        ] }),
        create: async (scheduled) => created.push(scheduled),
    };
    const task = new BackupsScheduledTask(service);
    await task.handleCron();
    hours = 3;
    await task.handleCron();
    assert.deepEqual(created, [true]);
});

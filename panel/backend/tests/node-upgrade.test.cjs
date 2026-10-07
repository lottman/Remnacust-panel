const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { nodeUpgradeSchema, nodeUpgradeScript, runNodeUpgrade } = load(
    path.join(__dirname, '../src/modules/node-ssh/ssh/node-upgrade.ts'),
);
const request = {
    t: 'node-upgrade',
    id: '00000000-0000-4000-8000-000000000001',
    directory: '/opt/remnanode',
};
const token = 'fixture-storage-token-12345';
test('upgrade only accepts a fixed operation and safe absolute directory', () => {
    for (const patch of [
        { id: 'bad' },
        { directory: 'relative' },
        { directory: '/' },
        { directory: '/a\nwhoami' },
        { directory: '/a\0b' },
        { tokenSource: 'shell' },
        { command: 'id' },
    ])
        assert.equal(nodeUpgradeSchema.safeParse({ ...request, ...patch }).success, false);
    const script = nodeUpgradeScript({ ...request, directory: '/opt/нода $(id); file' });
    assert.ok(!script.includes('/opt/нода $(id); file'));
    assert.ok(script.includes(Buffer.from('/opt/нода $(id); file').toString('base64')));
    assert.ok(!script.includes('Authorization:'));
    assert.ok(!script.includes('storage-token'));
    assert.ok(!script.includes('curl '));
    assert.ok(script.includes('pull remnanode'));
    assert.ok(script.includes('--wait --wait-timeout 120 remnanode'));
});

function ssh(exitCode) {
    let input, command;
    const stream = new EventEmitter();
    stream.stderr = new EventEmitter();
    stream.destroy = () => {};
    stream.end = (value) => {
        input = value;
        queueMicrotask(() => {
            stream.emit('data', Buffer.from(token + '\nREMNACUST_NODE_UPGRADE_PHASE:down'));
            stream.emit('data', Buffer.from('loading\nREMNACUST_NODE_UPGRADE_PHASE:updating\n'));
            stream.stderr.emit('data', Buffer.from('Authorization: Bearer ' + token));
            stream.emit('close', exitCode);
            stream.emit('close', 0);
        });
    };
    return {
        client: {
            exec: (cmd, cb) => {
                command = cmd;
                cb(null, stream);
            },
        },
        get command() {
            return command;
        },
        get input() {
            return input;
        },
    };
}
test('no storage credential is sent and output exposes only fixed phases', async () => {
    const channel = ssh(0),
        events = [];
    await runNodeUpgrade(channel.client, request, (event) => events.push(event));
    assert.ok(!channel.command.includes(token));
    assert.ok(!channel.input.includes(token));
    assert.ok(!JSON.stringify(events).includes(token));
    assert.deepEqual(
        events.map((e) => e.phase),
        ['preparing', 'downloading', 'updating', 'finished'],
    );
    assert.equal(events.at(-1).status, 'succeeded');
});
test('failed or interrupted remote command cannot report success', async () => {
    for (const code of [1, null]) {
        const channel = ssh(code),
            events = [];
        await runNodeUpgrade(channel.client, request, (e) => events.push(e));
        assert.equal(events.at(-1).status, 'failed');
        assert.equal(events.filter((e) => e.phase === 'finished').length, 1);
    }
    const events = [];
    await runNodeUpgrade({ exec: (_, cb) => cb(new Error('not connected')) }, request, (e) =>
        events.push(e),
    );
    assert.equal(events.at(-1).status, 'failed');
    const thrown = [];
    await runNodeUpgrade(
        {
            exec: () => {
                throw new Error('Disconnected');
            },
        },
        request,
        (e) => thrown.push(e),
    );
    assert.equal(thrown.at(-1).status, 'failed');
});

test('SSH session rejects overlapping updates and replays before reauthorizing again', async () => {
    let started = 0,
        authorized = 0,
        finish;
    const { SshSession } = load(
        path.join(__dirname, '../src/modules/node-ssh/ssh/ssh-session.ts'),
        {
            './optimization-status': {},
            '@libs/contracts/models': {},
            './browser-ssh-agent': {},
            './core-ssh-tunnel': {},
            './node-upgrade': {
                nodeUpgradeSchema,
                runNodeUpgrade: async () => {
                    started++;
                    await new Promise((resolve) => {
                        finish = resolve;
                    });
                },
            },
        },
    );
    const session = Object.create(SshSession.prototype),
        events = [];
    Object.assign(session, {
        closed: false,
        opened: true,
        client: {},
        upgradingNode: false,
        upgradeIds: new Set(),
        options: {
            authorizeNodeUpgrade: async () => {
                authorized++;
            },
        },
        send: (event) => events.push(event),
        touch: () => {},
    });
    const first = session.upgradeNode(request);
    await Promise.resolve();
    await session.upgradeNode(request);
    await session.upgradeNode({ ...request, id: '00000000-0000-4000-8000-000000000002' });
    assert.equal(started, 1);
    assert.equal(authorized, 1);
    assert.equal(events.at(-1).status, 'failed');
    finish();
    await first;
    await session.upgradeNode(request);
    assert.equal(started, 1);
    session.options.authorizeNodeUpgrade = async () => {
        throw new Error(token);
    };
    await session.upgradeNode({ ...request, id: '00000000-0000-4000-8000-000000000003' });
    assert.equal(started, 1);
    assert.ok(!JSON.stringify(events).includes(token));
});

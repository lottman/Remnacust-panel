const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { NodeResponseModel } = load(
    path.join(__dirname, '../src/modules/nodes/models/node.response.model.ts'),
    {
        '@common/utils/nano': { fromNanoToNumber: (value) => value },
    },
);
const cached = {
    system: { info: {}, stats: {} },
    onlineUsers: 17,
    xrayUptime: 500,
    versions: { xray: 'core', node: 'node' },
};
const online = { isConnected: true, isConnecting: false, isDisabled: false, activeInbounds: [] };
test('node responses clear live metrics while disconnected, connecting or disabled', () => {
    for (const flags of [{ isConnected: false }, { isConnecting: true }, { isDisabled: true }]) {
        const response = new NodeResponseModel({ ...online, ...flags }, cached);
        assert.equal(response.system, null);
        assert.equal(response.usersOnline, 0);
        assert.equal(response.xrayUptime, 0);
        assert.deepEqual(response.versions, cached.versions);
    }
    const response = new NodeResponseModel(online, cached);
    assert.deepEqual(response.system, cached.system);
    assert.equal(response.usersOnline, 17);
    assert.equal(response.xrayUptime, 500);
});

test('live telemetry from an older control generation cannot make the edited node look healthy', () => {
    const previous = '11111111-1111-4111-8111-111111111111';
    const current = '22222222-2222-4222-8222-222222222222';
    for (const controlRevision of [undefined, null, previous]) {
        const response = new NodeResponseModel(
            { ...online, controlRevision: current },
            { ...cached, controlRevision },
        );
        assert.equal(response.system, null);
        assert.equal(response.usersOnline, 0);
        assert.equal(response.xrayUptime, 0);
        assert.deepEqual(response.versions, cached.versions);
    }
    const response = new NodeResponseModel(
        { ...online, controlRevision: current },
        { ...cached, controlRevision: current },
    );
    assert.deepEqual(response.system, cached.system);
    assert.equal(response.usersOnline, 17);
    assert.equal(response.xrayUptime, 500);
});

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const load = require('../../backend/tests/load-typescript.cjs');
const root = path.join(__dirname, '..');
const { hasNodeErrorMessage, getNodeErrorMessage, nodeConfigurationNeedsRestart } = load(path.join(root, 'src/shared/utils/node-error-message.ts'));

test('empty serialized messages do not render an error card', () => {
    for (const value of [null, undefined, '', ' ', '{}', ' { \n } ', '[]', '[ ]', 'null', 'undefined', '""'])
        assert.equal(hasNodeErrorMessage(value), false, String(value));
    const widget = fs.readFileSync(path.join(root, 'src/widgets/dashboard/nodes/node-error-message/node-error-message.widget.tsx'), 'utf8');
    assert.match(widget, /if \(!node \|\| !hasNodeErrorMessage\(node.lastStatusMessage\)\)\s*\{\s*return null/);
});

test('timeouts, missing telemetry and deferred global settings have distinct explanations without hiding unknown errors', () => {
    const t = key => key;
    for (const value of ['canceled', '"canceled"', 'Node API request timed out'])
        assert.equal(getNodeErrorMessage(value, t), 'nodeErrors.requestTimeout');
    assert.equal(getNodeErrorMessage('Failed to get system stats', t), 'nodeErrors.telemetryUnavailable');
    const pending = 'runtime apply failed: Global core settings changed; preserve current sessions and apply this change during an explicit maintenance restart';
    assert.equal(nodeConfigurationNeedsRestart(pending), true);
    assert.equal(getNodeErrorMessage(pending, t), 'nodeErrors.maintenanceRestart');
    assert.equal(nodeConfigurationNeedsRestart('failed to parse config'), false);
    assert.equal(getNodeErrorMessage('unknown-error', t), 'nodeErrors.unknown');
    const widget = fs.readFileSync(path.join(root, 'src/widgets/dashboard/nodes/node-error-message/node-error-message.widget.tsx'), 'utf8');
    assert.match(widget, /details=\{node\.lastStatusMessage\}/);
    assert.match(widget, /copyValue=\{node\.lastStatusMessage\}/);
    const block = fs.readFileSync(path.join(root, 'src/shared/ui/error-message-block/error-message-block.tsx'), 'utf8');
    assert.match(block, /value=\{copyValue\}/);
});

test('real network, application and compatibility messages stay visible', () => {
    for (const message of ['Node route selection is cooling down', 'timeout of 15000ms exceeded',
        '[HOST_POLICY_PENDING] Retry pending', '[HOST_POLICY_UPGRADE_REQUIRED] Required capability missing',
        '[NODE_NATIVE_COMPATIBILITY]', '{"code":"ECONNRESET"}']) {
        assert.equal(hasNodeErrorMessage(message), true);
        assert.ok(getNodeErrorMessage(message, key => key));
    }
});

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPanelVersionNewer } from '../src/shared/utils/panel-version.ts'

test('release comparison accepts the panel revision without crashing its header', () => {
    assert.equal(isPanelVersionNewer('v1.1.7.1', '1.1.7'), true)
    assert.equal(isPanelVersionNewer('1.1.7.1', '1.1.7.1'), false)
    assert.equal(isPanelVersionNewer('1.1.7', '1.1.7.1'), false)
    assert.equal(isPanelVersionNewer('1.1.8', '1.1.7.9'), true)
    assert.equal(isPanelVersionNewer('1.1.7.10', '1.1.7.9'), true)
    assert.equal(isPanelVersionNewer('1.1.7.1-rc.1', '1.1.7.1'), false)
    assert.equal(isPanelVersionNewer('1.1.7.1', '1.1.7.1-rc.1'), true)
    assert.equal(isPanelVersionNewer('1.1.7.1+build.2', '1.1.7.1'), false)
    for (const invalid of ['', 'local', 'unknown', '1.1.7.1.2', '1.1.7.9007199254740992']) {
        assert.equal(isPanelVersionNewer(invalid, '1.1.7.1'), false)
        assert.equal(isPanelVersionNewer('1.1.8', invalid), false)
    }
})

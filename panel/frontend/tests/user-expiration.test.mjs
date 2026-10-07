import assert from 'node:assert/strict'
import test from 'node:test'

import { getUserExpirationState } from '../src/shared/ui/forms/users/forms-components/user-expiration.ts'

const now = Date.parse('2026-10-01T12:00:00Z')
test('a subscription with less than one day remaining is still valid', () => {
    assert.equal(getUserExpirationState('2026-10-01T18:00:00Z', now), 'soon')
})
test('only the actual expiry instant or an earlier date is expired', () => {
    assert.equal(getUserExpirationState(new Date(now + 1), now), 'soon')
    assert.equal(getUserExpirationState(new Date(now), now), 'expired')
    assert.equal(getUserExpirationState(new Date(now - 1), now), 'expired')
})
test('the seven-day warning uses full elapsed time, including timezone offsets', () => {
    assert.equal(getUserExpirationState('2026-10-08T15:00:00+03:00', now), 'soon')
    assert.equal(getUserExpirationState('2026-10-08T15:00:01+03:00', now), 'valid')
})
test('missing and malformed dates never masquerade as valid dates', () => {
    for (const date of [null, undefined, '', 'invalid', new Date(NaN)]) {
        assert.equal(getUserExpirationState(date, now), 'unknown')
    }
})

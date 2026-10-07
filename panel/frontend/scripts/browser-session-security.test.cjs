const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');

function tabs({ storageOnly = false, blockedStorage = false } = {}) {
    const channels = [], windows = [];
    let messages = 0;
    const create = () => {
        const listeners = {};
        const window = {
            addEventListener: (event, listener) => { listeners[event] = listener; },
            localStorage: { setItem(key, newValue) {
                if (blockedStorage) throw Error('storage denied');
                messages++;
                for (const other of windows) if (other !== window) other.storage?.({ key, newValue });
            } },
            storage: event => listeners.storage?.(event),
        };
        windows.push(window);
        const BroadcastChannel = storageOnly ? undefined : class {
            constructor(name) { this.name = name; channels.push(this); }
            addEventListener(_event, listener) { this.receive = listener; }
            postMessage(data) {
                messages++;
                for (const other of channels) if (other !== this && other.name === this.name) other.receive?.({ data });
            }
        };
        return load(path.join(__dirname, '../src/shared/emitters/emit-logout.ts'), {
            'consola/browser': { error() {} },
        }, { window, BroadcastChannel }).logoutEvents;
    };
    return { create, get messages() { return messages; } };
}

for (const storageOnly of [false, true]) {
    test(`logout reaches every tab without rebroadcast (${storageOnly ? 'storage' : 'channel'})`, () => {
        const f = tabs({ storageOnly });
        const first = f.create(), second = f.create();
        let firstLocks = 0, secondLocks = 0;
        first.subscribe(() => firstLocks++);
        second.subscribe(() => secondLocks++);
        first.emit();
        assert.equal(firstLocks, 1);
        assert.equal(secondLocks, 1);
        assert.equal(f.messages, 1);
        second.emit();
        assert.equal(firstLocks, 2);
        assert.equal(secondLocks, 2);
        assert.equal(f.messages, 2);
    });
}

test('storage failure and a throwing listener do not prevent local logout', () => {
    const emitter = tabs({ storageOnly: true, blockedStorage: true }).create();
    let locked = false;
    emitter.subscribe(() => { throw Error('listener failed'); });
    emitter.subscribe(() => { locked = true; });
    emitter.emit();
    assert.equal(locked, true);
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = require('../../backend-3.4.4-xera/tests/load-typescript.cjs');

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function harness(options = {}) {
    const state = { downloads: 0, compilations: 0, starts: 0, scripts: [], removed: 0, timers: new Map() };
    let timerId = 0;
    const window = {};
    class Go {
        importObject = {};
        run() {
            state.starts++;
            state.running = deferred();
            if (!options.neverReady) {
                window.XrayParseConfig = () => null;
                window.onWasmInitialized();
            }
            return state.running.promise;
        }
    }
    if (!options.noRuntime) window.Go = Go;
    const globals = {
        window, AbortController,
        setTimeout: (callback, ms) => {
            assert.equal(ms, 60_000);
            state.timers.set(++timerId, callback);
            return timerId;
        },
        clearTimeout: id => state.timers.delete(id),
        document: {
            createElement: () => ({ remove: () => state.removed++ }),
            head: { append: script => {
                state.scripts.push(script);
                if (!options.blockScript) queueMicrotask(() => {
                    window.Go = Go;
                    script.onload?.();
                });
            } }
        },
        fetch: async (url, init) => {
            state.downloads++;
            state.downloadSignal = init.signal;
            if (options.fetch) return options.fetch(url, init, state);
            return new Response(new Uint8Array(8), { headers: { 'content-type': 'application/wasm' } });
        },
        WebAssembly: {
            compileStreaming: async response => {
                state.compilations++;
                return options.compile ? options.compile(response, state) : {};
            },
            compile: async () => { state.compilations++; return {}; },
            instantiate: async () => options.instantiate ? options.instantiate(state) : {}
        }
    };
    const loader = load(path.join(__dirname, '../src/shared/utils/xray-wasm.ts'), {
        'src/config': { app: { configEditor: { wasmUrl: '/core.wasm?v=1.1.1', wasmJsUrl: '/runtime.js?v=1.1.1' } } }
    }, globals);
    state.expire = () => { for (const callback of [...state.timers.values()]) callback(); };
    return { ...loader, state, window, options };
}

test('parallel editors share startup and reuse the initialized parser', async () => {
    const h = harness();
    const first = h.initializeXrayWasm();
    assert.equal(first, h.initializeXrayWasm());
    await first;
    await h.initializeXrayWasm();
    assert.equal(h.state.downloads, 1);
    assert.equal(h.state.starts, 1);
    assert.equal(h.state.timers.size, 0);
});

test('a stalled download ends, aborts the request and permits a real retry', async () => {
    const h = harness({ fetch: () => new Promise(() => {}) });
    const first = h.initializeXrayWasm();
    const rejected = assert.rejects(first, /timed out/);
    await flush();
    [...h.state.timers.values()][0]();
    await rejected;
    await flush();
    assert.equal(h.state.downloadSignal.aborted, true);
    assert.equal(h.state.timers.size, 0);
    delete h.options.fetch;
    await h.initializeXrayWasm();
    assert.equal(h.state.downloads, 2);
    assert.equal(h.state.starts, 1);
    assert.equal(h.state.timers.size, 0);
});

test('the deadline also covers streaming compilation, not only HTTP headers', async () => {
    const oldCompilation = deferred();
    const h = harness({ compile: () => oldCompilation.promise });
    const first = h.initializeXrayWasm();
    const rejected = assert.rejects(first, /timed out/);
    await flush();
    h.state.expire();
    await rejected;
    await flush();
    delete h.options.compile;
    await h.initializeXrayWasm();
    oldCompilation.reject(new Error('late failure'));
    await flush();
    h.state.running.reject(new Error('Go program has already exited'));
    await flush();
    await h.initializeXrayWasm();
    assert.equal(h.state.downloads, 2);
    assert.equal(h.state.starts, 2);
});

test('an HTTP error is not cached and the next attempt downloads again', async () => {
    const h = harness({ fetch: () => new Response('', { status: 503 }) });
    await assert.rejects(h.initializeXrayWasm(), /503/);
    delete h.options.fetch;
    await h.initializeXrayWasm();
    assert.equal(h.state.downloads, 2);
});

test('a missing runtime loads the versioned script once and can recover from failure', async () => {
    const h = harness({ noRuntime: true, blockScript: true });
    const first = h.initializeXrayWasm();
    const rejected = assert.rejects(first, /runtime could not be downloaded/);
    h.state.scripts[0].onerror();
    await rejected;
    delete h.options.blockScript;
    await h.initializeXrayWasm();
    assert.deepEqual(h.state.scripts.map(s => s.src), ['/runtime.js?v=1.1.1', '/runtime.js?v=1.1.1']);
    assert.equal(h.state.removed, 1);
    assert.equal(h.state.downloads, 1);
});

test('a runtime request that never completes is removed at the deadline', async () => {
    const h = harness({ noRuntime: true, blockScript: true });
    const rejected = assert.rejects(h.initializeXrayWasm(), /timed out/);
    h.state.expire();
    await rejected;
    assert.equal(h.state.removed, 1);
    assert.equal(h.state.downloads, 0);
    delete h.options.blockScript;
    await h.initializeXrayWasm();
    assert.equal(h.state.starts, 1);
});

test('stalled instantiation cannot later start a second Go runtime', async () => {
    const oldInstance = deferred();
    const h = harness({ instantiate: () => oldInstance.promise });
    const rejected = assert.rejects(h.initializeXrayWasm(), /timed out/);
    await flush();
    h.state.expire();
    await rejected;
    delete h.options.instantiate;
    await h.initializeXrayWasm();
    oldInstance.resolve({});
    await flush();
    assert.equal(h.state.starts, 1);
    assert.equal(h.state.downloads, 1);
});

test('a runtime crash clears its parser and restarts without another download', async () => {
    const h = harness();
    await h.initializeXrayWasm();
    h.state.running.reject(new Error('Go program has already exited'));
    await flush();
    assert.equal(h.window.XrayParseConfig, undefined);
    await h.initializeXrayWasm();
    assert.equal(h.state.downloads, 1);
    assert.equal(h.state.starts, 2);
});

test('a Go runtime that never signals readiness ends at the deadline and can restart', async () => {
    const h = harness({ neverReady: true });
    const rejected = assert.rejects(h.initializeXrayWasm(), /timed out/);
    await flush();
    assert.equal(h.state.starts, 1);
    h.state.expire();
    await rejected;
    assert.equal(h.window.onWasmInitialized, undefined);
    delete h.options.neverReady;
    await h.initializeXrayWasm();
    assert.equal(h.state.starts, 2);
    assert.equal(h.state.downloads, 1);
});

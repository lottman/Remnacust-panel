const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { webcrypto } = require('node:crypto')

const exportsRef = {}
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/shared/utils/editor-recovery-store.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText)(exportsRef)
const { createEditorRecoveryStore, EditorRecoveryError, EDITOR_RECOVERY_LIMITS,
    createIndexedDbEditorRecoveryStorage } = exportsRef

class MemoryStorage {
    state = undefined
    documents = new Map()
    reads = []
    writes = []
    queue = Promise.resolve()
    active = false
    failNext = false
    transactions = 0
    transaction(scope, operation, readDocument = false) {
        const result = this.queue.then(() => {
            this.active = true
            this.transactions++
            try {
                const key = JSON.stringify([scope.owner, scope.kind, scope.id])
                if (readDocument) this.reads.push(key)
                const change = operation(structuredClone(this.state), readDocument ? structuredClone(this.documents.get(key)) : undefined)
                assert.equal(typeof change?.then, 'undefined', 'transaction callback must be synchronous')
                if (this.failNext) { this.failNext = false; throw new Error('fixture transaction aborted') }
                if (change.state !== undefined) this.state = structuredClone(change.state)
                for (const removed of change.deleteDocuments ?? []) this.documents.delete(removed)
                if (change.document !== undefined) {
                    this.documents.set(key, structuredClone(change.document))
                    this.writes.push(key)
                }
                return structuredClone(change.value)
            } finally { this.active = false }
        })
        this.queue = result.catch(() => {})
        return result
    }
}

const ownerA = '10000000-0000-4000-8000-000000000001'
const ownerB = '10000000-0000-4000-8000-000000000002'
const scope = (id = 'resource', owner = ownerA, kind = 'profile') => ({ owner, kind, id })
const errorCode = code => error => error instanceof EditorRecoveryError && error.code === code
function deferred() {
    let resolve
    const promise = new Promise(r => { resolve = r })
    return { promise, resolve }
}

function fixture(storage = new MemoryStorage(), overrides = {}) {
    const clock = { value: 1_800_000_000_000 }
    const cryptography = {
        getRandomValues: value => webcrypto.getRandomValues(value),
        subtle: Object.fromEntries(['digest', 'generateKey', 'encrypt', 'decrypt'].map(name => [name,
            (...args) => {
                assert.equal(storage.active, false, `${name} ran inside a storage transaction`)
                return (overrides[name] ?? webcrypto.subtle[name].bind(webcrypto.subtle))(...args)
            }
        ]))
    }
    return { storage, clock, store: createEditorRecoveryStore({ storage, crypto: cryptography, now: () => clock.value }) }
}

function entry(storage, id = 'resource', owner = ownerA, kind = 'profile') {
    return storage.state.owners.find(value => value.owner === owner)?.entries.find(value => value.id === id && value.kind === kind)
}

function document(storage, id = 'resource', owner = ownerA, kind = 'profile') {
    return storage.documents.get(JSON.stringify([owner, kind, id]))
}

test('encrypted recovery round-trips Unicode, blank code and one latest record across store instances', async () => {
    const { store, storage, clock } = fixture()
    const baseline = 'server baseline secret'
    const session = await store.open(scope(), baseline)
    assert.equal(await session.read(), null)
    const code = 'const credential = "fixture-secret-token"; // Привет فارسی 中文 😀'
    await session.write(code)
    assert.deepEqual(await session.read(), { code, updatedAt: clock.value })
    const key = storage.state.owners[0].key
    assert.equal(key.extractable, false)
    await assert.rejects(webcrypto.subtle.exportKey('raw', key))
    const record = document(storage)
    assert.equal(record.iv.byteLength, 12)
    assert.equal(record.ciphertext.byteLength, Buffer.byteLength(code) + 16)
    assert(!Buffer.from(record.ciphertext).includes(Buffer.from('fixture-secret-token')))
    assert(!JSON.stringify(storage.state).includes(baseline))
    assert(!JSON.stringify(storage.state).includes('fixture-secret-token'))
    assert.match(entry(storage).baseline, /^[a-f0-9]{64}$/)
    const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(baseline))).toString('hex')
    assert.equal(entry(storage).baseline, expected)
    const reopened = await fixture(storage).store.open(scope(), baseline)
    assert.deepEqual(await reopened.read(), { code, updatedAt: clock.value })
    clock.value++
    await session.write('')
    assert.deepEqual(await session.read(), { code: '', updatedAt: clock.value })
    assert.equal(storage.state.owners[0].entries.filter(value => value.record).length, 1)
    assert.notDeepEqual(document(storage).iv, record.iv)
})

test('owner, resource kind and ID isolate records and independent nonextractable keys', async () => {
    const { store, storage } = fixture()
    const scopes = [scope(), scope('resource', ownerB), scope('resource', ownerA, 'template'), scope('other')]
    const sessions = await Promise.all(scopes.map(value => store.open(value, 'same server')))
    for (let index = 0; index < sessions.length; index++) await sessions[index].write(`private-${index}`)
    for (let index = 0; index < sessions.length; index++) assert.equal((await sessions[index].read()).code, `private-${index}`)
    const [first, second] = storage.state.owners
    assert.notEqual(first.key, second.key)
    const record = document(storage)
    await assert.rejects(webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, second.key, record.ciphertext))
    const upperOwner = await store.open(scope('resource', ownerA.toUpperCase()), 'same server')
    assert.equal((await upperOwner.read()).code, 'private-0')
})

test('simultaneous first opens atomically choose one owner key and keep both resources readable', async () => {
    const storage = new MemoryStorage()
    let generated = 0
    const generateKey = async (...args) => { generated++; return webcrypto.subtle.generateKey(...args) }
    const first = fixture(storage, { generateKey }), second = fixture(storage, { generateKey })
    const [a, b] = await Promise.all([first.store.open(scope('a'), 'base'), second.store.open(scope('b'), 'base')])
    assert.equal(generated, 2)
    assert.equal(storage.state.owners.length, 1)
    await Promise.all([a.write('alpha'), b.write('beta')])
    assert.equal((await a.read()).code, 'alpha')
    assert.equal((await b.read()).code, 'beta')
})

for (const action of ['discard', 'saved']) {
    test(`${action} fences in-flight encryption and other-tab sessions; the same session can write again`, async () => {
        const entered = deferred(), release = deferred()
        let delay = false
        const { store, storage } = fixture(undefined, {
            encrypt: async (...args) => {
                const encrypted = await webcrypto.subtle.encrypt(...args)
                if (delay) { entered.resolve(); await release.promise }
                return encrypted
            }
        })
        const session = await store.open(scope(), 'old server')
        const otherTab = await fixture(storage).store.open(scope(), 'old server')
        await session.write('earlier draft')
        delay = true
        const pending = assert.rejects(session.write('pending stale draft'), errorCode('stale'))
        await entered.promise
        if (action === 'saved') await session.saved('new server')
        else await session.discard()
        assert.equal(entry(storage).record, undefined)
        assert.equal(await otherTab.read(), null)
        release.resolve()
        await pending
        await assert.rejects(otherTab.write('revival from other tab'), errorCode('stale'))
        delay = false
        await session.write('new editor change')
        assert.equal((await session.read()).code, 'new editor change')
        const reopened = await store.open(scope(), action === 'saved' ? 'new server' : 'old server')
        assert.equal((await reopened.read()).code, 'new editor change')
    })
}

test('server baseline changes delete recovery and fence old sessions and pending writes', async () => {
    const entered = deferred(), release = deferred()
    let delay = false
    const { store, storage } = fixture(undefined, { encrypt: async (...args) => {
        const result = await webcrypto.subtle.encrypt(...args)
        if (delay) { entered.resolve(); await release.promise }
        return result
    } })
    const old = await store.open(scope(), 'server v1')
    await old.write('draft v1')
    delay = true
    const pending = assert.rejects(old.write('old in flight'), errorCode('stale'))
    await entered.promise
    const fresh = await fixture(storage).store.open(scope(), 'server v2')
    assert.equal(await fresh.read(), null)
    release.resolve()
    await pending
    await assert.rejects(old.write('revived old baseline'), errorCode('stale'))
    await fresh.write('fresh draft')
    assert.equal((await fresh.read()).code, 'fresh draft')
})

test('last same-session invocation wins even when encryption completes out of order', async () => {
    const entered = deferred(), release = deferred()
    let calls = 0
    const { store } = fixture(undefined, { encrypt: async (...args) => {
        const call = ++calls
        const result = await webcrypto.subtle.encrypt(...args)
        if (call === 1) { entered.resolve(); await release.promise }
        return result
    } })
    const session = await store.open(scope(), 'base')
    const old = assert.rejects(session.write('older'), errorCode('stale'))
    await entered.promise
    await session.write('latest')
    release.resolve()
    await old
    assert.equal((await session.read()).code, 'latest')
})

test('a decrypt finishing after another-tab deletion does not return stale plaintext', async () => {
    const storage = new MemoryStorage()
    const entered = deferred(), release = deferred()
    const first = fixture(storage)
    const second = fixture(storage, { decrypt: async (...args) => {
        const result = await webcrypto.subtle.decrypt(...args)
        entered.resolve(); await release.promise
        return result
    } })
    const a = await first.store.open(scope(), 'base')
    const b = await second.store.open(scope(), 'base')
    await a.write('draft')
    const pending = b.read()
    await entered.promise
    await a.discard()
    release.resolve()
    assert.equal(await pending, null)
})

test('seven-day expiry is exact and expired records cannot be revived by old sessions', async () => {
    const { store, clock, storage } = fixture()
    const session = await store.open(scope(), 'base')
    await session.write('draft')
    clock.value += EDITOR_RECOVERY_LIMITS.ageMs - 1
    assert.equal((await session.read()).code, 'draft')
    clock.value++
    assert.equal(await session.read(), null)
    assert.equal(entry(storage).record, undefined)
    await assert.rejects(session.write('revival'), errorCode('stale'))
    const fresh = await store.open(scope(), 'base')
    await fresh.write('fresh')
    assert.equal((await fresh.read()).code, 'fresh')
})

test('per-owner quota evicts the oldest document and fences its old session', async () => {
    const { store, clock, storage } = fixture()
    const sessions = []
    for (let index = 0; index < 21; index++) {
        const session = await store.open(scope(String(index)), 'base')
        await session.write(`draft-${index}`)
        sessions.push(session)
        clock.value++
    }
    assert.equal(storage.state.owners[0].entries.filter(value => value.record).length, 20)
    assert.equal(await sessions[0].read(), null)
    await assert.rejects(sessions[0].write('evicted revival'), errorCode('stale'))
    assert.equal((await sessions[20].read()).code, 'draft-20')
    const other = await store.open(scope('other', ownerB), 'base')
    await other.write('independent owner')
    assert.equal(storage.state.owners.find(value => value.owner === ownerA).entries.filter(value => value.record).length, 20)
})

test('8 MiB UTF-8 boundary is enforced before encryption and the global ciphertext budget includes GCM tags', async () => {
    let encryptions = 0
    const { store, clock, storage } = fixture(undefined, { encrypt: (...args) => {
        encryptions++
        return webcrypto.subtle.encrypt(...args)
    } })
    const a = await store.open(scope('a'), 'base')
    const max = '界' + 'x'.repeat(EDITOR_RECOVERY_LIMITS.textBytes - 3)
    await a.write(max)
    assert.equal((await a.read()).code, max)
    await assert.rejects(a.write(max + 'x'), errorCode('too-large'))
    assert.equal(encryptions, 1)
    clock.value++
    const b = await store.open(scope('b', ownerB), 'base')
    await b.write(max)
    const records = storage.state.owners.flatMap(value => value.entries).flatMap(value => value.record ? [value.record] : [])
    assert(records.reduce((sum, value) => sum + value.bytes, 0) <= EDITOR_RECOVERY_LIMITS.ciphertextBytes)
    assert.equal(records.length, 1)
    assert.equal(await a.read(), null)
    await assert.rejects(a.write('evicted revival'), errorCode('stale'))
})

test('bounded metadata does not revive fenced sessions after resource removal and recreation', async () => {
    const { store, storage, clock } = fixture()
    const old = await store.open(scope('old'), 'base')
    await old.discard()
    for (let index = 0; index < 80; index++) {
        clock.value++
        await store.open(scope('empty-' + index), 'base')
    }
    assert(storage.state.owners[0].entries.length <= 40)
    const fresh = await store.open(scope('old'), 'base')
    await assert.rejects(old.write('revival'), errorCode('stale'))
    await fresh.write('new token')
    assert.equal((await fresh.read()).code, 'new token')
})

for (const tamper of ['ciphertext', 'owner', 'kind', 'id', 'baseline', 'updatedAt']) {
    test(`AES-GCM binds ${tamper} and rejects tampered recovery`, async () => {
        const { store, storage } = fixture()
        const session = await store.open(scope(), 'base')
        await session.write('secret draft')
        const raw = entry(storage)
        if (tamper === 'ciphertext') new Uint8Array(document(storage).ciphertext)[0] ^= 1
        else if (tamper === 'updatedAt') { raw.record.updatedAt++; document(storage).updatedAt++ }
        else if (tamper === 'owner') storage.state.owners[0].owner = ownerB
        else if (tamper === 'kind') raw.kind = 'template'
        else if (tamper === 'id') raw.id = 'other'
        else raw.baseline = '0'.repeat(64)
        if (tamper === 'owner' || tamper === 'kind' || tamper === 'id' || tamper === 'baseline') {
            const changedScope = scope(tamper === 'id' ? 'other' : 'resource', tamper === 'owner' ? ownerB : ownerA, tamper === 'kind' ? 'template' : 'profile')
            if (tamper === 'baseline') {
                assert.equal(await session.read(), null)
                assert.equal(entry(storage).record, undefined)
            } else {
                const changed = await store.open(changedScope, 'base')
                await assert.rejects(changed.read(), errorCode('corrupt'))
            }
        } else await assert.rejects(session.read(), errorCode('corrupt'))
    })
}

test('schema corruption, oversized input, missing browser storage and aborted transactions reject explicitly', async () => {
    const { store, storage } = fixture()
    for (const invalid of [{ ...scope(), owner: 'jwt-token' }, { ...scope(), kind: 'other' }, { ...scope(), id: '../\ninvalid' }])
        await assert.rejects(store.open(invalid, 'base'), errorCode('corrupt'))
    await assert.rejects(store.open(scope(), '界'.repeat(EDITOR_RECOVERY_LIMITS.textBytes / 2)), errorCode('too-large'))
    const session = await store.open(scope(), 'base')
    await session.write('last good')
    storage.failNext = true
    await assert.rejects(session.write('aborted'), errorCode('unavailable'))
    assert.equal((await session.read()).code, 'last good')
    document(storage).iv = new Uint8Array(13)
    await assert.rejects(session.read(), errorCode('corrupt'))
    await assert.rejects(createEditorRecoveryStore({ storage: createIndexedDbEditorRecoveryStorage(undefined), crypto: webcrypto }).open(scope(), 'base'), errorCode('unavailable'))
})

test('undo to the baseline clears only this session record and preserves another tab replacement', async () => {
    const { store, storage } = fixture()
    const a = await store.open(scope(), 'server baseline')
    const b = await fixture(storage).store.open(scope(), 'server baseline')
    await a.write('A draft')
    await a.write('server baseline')
    assert.equal(await a.read(), null)
    await a.write('A newer draft')
    await b.write('B replacement')
    const before = structuredClone(entry(storage).record)
    await a.write('server baseline')
    assert.deepEqual(entry(storage).record, before)
    assert.equal((await b.read()).code, 'B replacement')
    await b.write('server baseline')
    assert.equal(await b.read(), null)
    await a.saved('new baseline')
    await a.write('server baseline')
    assert.equal((await a.read()).code, 'server baseline')
    await a.write('new baseline')
    assert.equal(await a.read(), null)
})

test('undo cancels this session delayed write without deleting a peer record or fencing that peer', async () => {
    const entered = deferred(), release = deferred()
    let delay = false
    const { store, storage } = fixture(undefined, { encrypt: async (...args) => {
        const result = await webcrypto.subtle.encrypt(...args)
        if (delay) { entered.resolve(); await release.promise }
        return result
    } })
    const a = await store.open(scope(), 'base')
    const b = await fixture(storage).store.open(scope(), 'base')
    await b.write('peer draft')
    delay = true
    const pending = assert.rejects(a.write('pending A'), errorCode('stale'))
    await entered.promise
    await a.write('base')
    release.resolve()
    await pending
    assert.equal((await b.read()).code, 'peer draft')
    await b.write('peer continues')
    assert.equal((await b.read()).code, 'peer continues')
})

test('raw invalid and empty code are preserved unless equal to their exact baseline', async () => {
    const { store } = fixture()
    const session = await store.open(scope(), '{"valid":true}')
    for (const code of ['', '{invalid JSON', '  ', '\n']) {
        await session.write(code)
        assert.equal((await session.read()).code, code)
    }
    const emptyBase = await store.open(scope('empty-base'), '')
    await emptyBase.write('invalid')
    await emptyBase.write('')
    assert.equal(await emptyBase.read(), null)
})

function indexedDbFixture() {
    const stores = new Map()
    const log = []
    let version = 0
    const factory = {
        open(_name, requestedVersion) {
            const request = {}
            queueMicrotask(() => {
                const db = {
                    objectStoreNames: { contains: name => stores.has(name) },
                    createObjectStore: name => stores.set(name, new Map()),
                    deleteObjectStore: name => stores.delete(name),
                    close() {},
                    transaction(names) {
                        const tx = {}
                        const snapshot = new Map(names.map(name => [name, new Map(stores.get(name))]))
                        let pending = 0, finished = false, completion
                        function settle() {
                            clearImmediate(completion)
                            completion = setImmediate(() => {
                                if (pending || finished) return
                                finished = true
                                for (const [name, rows] of snapshot) stores.set(name, rows)
                                tx.oncomplete?.()
                            })
                        }
                        function enqueue(name, action, key, value) {
                            pending++
                            log.push({ store: name, action, key })
                            const event = {}
                            queueMicrotask(() => {
                                if (finished) return
                                try {
                                    const rows = snapshot.get(name)
                                    if (action === 'get') event.result = structuredClone(rows.get(key))
                                    else if (action === 'put') rows.set(key, structuredClone(value))
                                    else rows.delete(key)
                                    event.onsuccess?.()
                                } catch (error) { tx.error = error; tx.abort() }
                                finally { pending--; settle() }
                            })
                            return event
                        }
                        tx.abort = () => {
                            finished = true
                            clearImmediate(completion)
                            queueMicrotask(() => tx.onabort?.())
                        }
                        tx.objectStore = name => ({
                            get: key => enqueue(name, 'get', key),
                            put: (value, key) => enqueue(name, 'put', key, value),
                            delete: key => enqueue(name, 'delete', key)
                        })
                        settle()
                        return tx
                    }
                }
                request.result = db
                if (version !== requestedVersion) {
                    request.onupgradeneeded?.({ oldVersion: version })
                    version = requestedVersion
                }
                request.onsuccess?.()
            })
            return request
        }
    }
    return { factory, stores, log }
}

test('actual IndexedDB adapter reads and writes only selected ciphertext plus bounded metadata', async () => {
    const { factory, stores, log } = indexedDbFixture()
    const store = createEditorRecoveryStore({ storage: createIndexedDbEditorRecoveryStorage(factory), crypto: webcrypto })
    const a = await store.open(scope('a'), 'base')
    const b = await store.open(scope('b', ownerB), 'base')
    await a.write('a'.repeat(1024 * 1024))
    await b.write('b'.repeat(1024 * 1024))
    const keyA = JSON.stringify([ownerA, 'profile', 'a'])
    const keyB = JSON.stringify([ownerB, 'profile', 'b'])
    const beforeB = stores.get('documents').get(keyB)
    log.length = 0
    await a.write('changed A')
    assert.deepEqual(log.filter(value => value.store === 'documents'), [{ store: 'documents', action: 'put', key: keyA }])
    assert.equal(stores.get('documents').get(keyB), beforeB)
    const metadata = stores.get('recovery').get('state')
    assert(!JSON.stringify(metadata).includes('ciphertext'))
    assert(JSON.stringify(metadata).length < 4096)
    log.length = 0
    assert.equal((await a.read()).code, 'changed A')
    assert.deepEqual(log.filter(value => value.store === 'documents'), [{ store: 'documents', action: 'get', key: keyA }])
    log.length = 0
    await a.discard()
    assert.deepEqual(log.filter(value => value.store === 'documents'), [{ store: 'documents', action: 'delete', key: keyA }])
    assert.equal(stores.get('documents').get(keyB), beforeB)
})

test('schema bounds reject oversized metadata and invalid keys before decrypting ciphertext', async () => {
    const { store, storage } = fixture(undefined, { decrypt: () => assert.fail('invalid schema reached decryption') })
    const session = await store.open(scope(), 'base')
    await session.write('draft')
    const good = structuredClone(storage.state)
    const invalidKey = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    for (const mutate of [
        state => { state.version = 2 },
        state => { state.owners = Array(33).fill(state.owners[0]) },
        state => { state.owners[0].entries = Array(41).fill(state.owners[0].entries[0]) },
        state => { state.owners[0].key = invalidKey },
        state => { state.owners[0].entries[0].record.bytes = EDITOR_RECOVERY_LIMITS.textBytes + 17 },
        state => { state.owners[0].entries[0].record.code = 'plaintext is forbidden' }
    ]) {
        storage.state = structuredClone(good)
        mutate(storage.state)
        await assert.rejects(session.read(), errorCode('corrupt'))
    }
})

test('pending encryption cannot commit a recovery that has already expired', async () => {
    const entered = deferred(), release = deferred()
    const { store, clock, storage } = fixture(undefined, { encrypt: async (...args) => {
        const result = await webcrypto.subtle.encrypt(...args)
        entered.resolve(); await release.promise
        return result
    } })
    const session = await store.open(scope(), 'base')
    const pending = assert.rejects(session.write('delayed'), errorCode('stale'))
    await entered.promise
    clock.value += EDITOR_RECOVERY_LIMITS.ageMs
    release.resolve()
    await pending
    assert.equal(storage.documents.size, 0)
})

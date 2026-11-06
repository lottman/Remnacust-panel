export type EditorRecoveryScope = {
    owner: string
    kind: 'profile' | 'template'
    id: string
}

export type EditorRecoveryErrorCode = 'unavailable' | 'too-large' | 'stale' | 'corrupt'

export class EditorRecoveryError extends Error {
    constructor(public readonly code: EditorRecoveryErrorCode) {
        super(`Editor recovery: ${code}`)
        this.name = 'EditorRecoveryError'
    }
}

export interface EditorRecoverySession {
    read(): Promise<{ code: string; updatedAt: number } | null>
    write(code: string): Promise<void>
    discard(): Promise<void>
    saved(newBaseline: string): Promise<void>
}

export interface EditorRecoveryStorageAdapter {
    transaction<T>(
        scope: EditorRecoveryScope,
        operation: (
            state: unknown,
            document: unknown
        ) => {
            state?: unknown
            document?: unknown
            deleteDocuments?: string[]
            value: T
        },
        readDocument?: boolean
    ): Promise<T>
}

export const EDITOR_RECOVERY_LIMITS = {
    textBytes: 8 * 1024 * 1024,
    ciphertextBytes: 16 * 1024 * 1024,
    documentsPerOwner: 20,
    ageMs: 7 * 24 * 60 * 60 * 1000
} as const

const MAX_OWNERS = 32
const MAX_ENTRIES = 40
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const TOKEN = /^[a-f0-9]{32}$/
const encoder = new TextEncoder()

type EncryptedRecovery = {
    iv: Uint8Array<ArrayBuffer>
    ciphertext: ArrayBuffer
    updatedAt: number
    writeId: string
    writerId: string
}

type Entry = {
    kind: EditorRecoveryScope['kind']
    id: string
    baseline: string
    generation: string
    touchedAt: number
    record?: Pick<EncryptedRecovery, 'updatedAt' | 'writeId' | 'writerId'> & { bytes: number }
}

type Owner = { owner: string; key: CryptoKey; touchedAt: number; entries: Entry[] }
type State = { version: 1; owners: Owner[] }

function fail(code: EditorRecoveryErrorCode): never {
    throw new EditorRecoveryError(code)
}

function translated(error: unknown, code: EditorRecoveryErrorCode): EditorRecoveryError {
    return error instanceof EditorRecoveryError ? error : new EditorRecoveryError(code)
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fields(value: unknown, allowed: string[]): value is Record<string, unknown> {
    return object(value) && Object.keys(value).every((key) => allowed.includes(key))
}

function timestamp(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) >= 0
}

function identifier(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 256 &&
        value.trim().length > 0 &&
        !Array.from(value).some(
            (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ) &&
        encoder.encode(value).byteLength <= 256
    )
}

function scopeValue(value: EditorRecoveryScope): EditorRecoveryScope {
    if (
        !fields(value, ['owner', 'kind', 'id']) ||
        typeof value.owner !== 'string' ||
        !UUID.test(value.owner) ||
        !['profile', 'template'].includes(String(value.kind)) ||
        !identifier(value.id)
    )
        fail('corrupt')
    return {
        owner: value.owner.toLowerCase(),
        kind: value.kind as EditorRecoveryScope['kind'],
        id: value.id
    }
}

function encodedText(value: string): Uint8Array<ArrayBuffer> {
    if (typeof value !== 'string') fail('corrupt')
    if (value.length > EDITOR_RECOVERY_LIMITS.textBytes) fail('too-large')
    let bytes = 0
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index)
        if (code < 0x80) bytes++
        else if (code < 0x800) bytes += 2
        else if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(++index)
            if (!(next >= 0xdc00 && next <= 0xdfff)) fail('corrupt')
            bytes += 4
        } else if (code >= 0xdc00 && code <= 0xdfff) fail('corrupt')
        else bytes += 3
        if (bytes > EDITOR_RECOVERY_LIMITS.textBytes) fail('too-large')
    }
    return encoder.encode(value)
}

function keyValue(value: unknown): value is CryptoKey {
    if (Object.prototype.toString.call(value) !== '[object CryptoKey]') return false
    const key = value as CryptoKey
    return (
        key.type === 'secret' &&
        key.extractable === false &&
        key.algorithm.name === 'AES-GCM' &&
        (key.algorithm as AesKeyAlgorithm).length === 256 &&
        key.usages.length === 2 &&
        key.usages.includes('encrypt') &&
        key.usages.includes('decrypt')
    )
}

function stateValue(value: unknown): State {
    if (value === undefined) return { version: 1, owners: [] }
    if (
        !fields(value, ['version', 'owners']) ||
        value.version !== 1 ||
        !Array.isArray(value.owners) ||
        value.owners.length > MAX_OWNERS
    )
        fail('corrupt')
    const owners = new Set<string>()
    let bytes = 0
    for (const owner of value.owners) {
        if (
            !fields(owner, ['owner', 'key', 'touchedAt', 'entries']) ||
            typeof owner.owner !== 'string' ||
            !UUID.test(owner.owner) ||
            owner.owner !== owner.owner.toLowerCase() ||
            owners.has(owner.owner) ||
            !keyValue(owner.key) ||
            !timestamp(owner.touchedAt) ||
            !Array.isArray(owner.entries) ||
            owner.entries.length > MAX_ENTRIES
        )
            fail('corrupt')
        owners.add(owner.owner)
        const resources = new Set<string>()
        let documents = 0
        for (const entry of owner.entries) {
            if (
                !fields(entry, ['kind', 'id', 'baseline', 'generation', 'touchedAt', 'record']) ||
                !['profile', 'template'].includes(String(entry.kind)) ||
                !identifier(entry.id) ||
                typeof entry.baseline !== 'string' ||
                !HASH.test(entry.baseline) ||
                typeof entry.generation !== 'string' ||
                !TOKEN.test(entry.generation) ||
                !timestamp(entry.touchedAt)
            )
                fail('corrupt')
            const resource = JSON.stringify([entry.kind, entry.id])
            if (resources.has(resource)) fail('corrupt')
            resources.add(resource)
            if (entry.record !== undefined) {
                const record = entry.record
                if (
                    !fields(record, ['bytes', 'updatedAt', 'writeId', 'writerId']) ||
                    !Number.isSafeInteger(record.bytes) ||
                    Number(record.bytes) < 16 ||
                    Number(record.bytes) > EDITOR_RECOVERY_LIMITS.textBytes + 16 ||
                    !timestamp(record.updatedAt) ||
                    typeof record.writeId !== 'string' ||
                    !TOKEN.test(record.writeId) ||
                    typeof record.writerId !== 'string' ||
                    !TOKEN.test(record.writerId)
                )
                    fail('corrupt')
                bytes += Number(record.bytes)
                documents++
            }
        }
        if (documents > EDITOR_RECOVERY_LIMITS.documentsPerOwner) fail('corrupt')
    }
    if (bytes > EDITOR_RECOVERY_LIMITS.ciphertextBytes) fail('corrupt')
    return value as State
}

function documentKey(scope: EditorRecoveryScope): string {
    return JSON.stringify([scope.owner, scope.kind, scope.id])
}

function documentKeys(state: State): Set<string> {
    return new Set(
        state.owners.flatMap((owner) =>
            owner.entries
                .filter((entry) => entry.record)
                .map((entry) => documentKey({ owner: owner.owner, kind: entry.kind, id: entry.id }))
        )
    )
}

function documentValue(value: unknown, metadata: NonNullable<Entry['record']>): EncryptedRecovery {
    if (
        !fields(value, ['iv', 'ciphertext', 'updatedAt', 'writeId', 'writerId']) ||
        !(value.iv instanceof Uint8Array) ||
        value.iv.byteLength !== 12 ||
        value.iv.byteOffset !== 0 ||
        value.iv.buffer.byteLength !== 12 ||
        !(value.ciphertext instanceof ArrayBuffer) ||
        value.ciphertext.byteLength !== metadata.bytes ||
        value.updatedAt !== metadata.updatedAt ||
        value.writeId !== metadata.writeId ||
        value.writerId !== metadata.writerId
    )
        fail('corrupt')
    return value as EncryptedRecovery
}

export function createIndexedDbEditorRecoveryStorage(
    factory: IDBFactory | undefined = globalThis.indexedDB
): EditorRecoveryStorageAdapter {
    async function database(): Promise<IDBDatabase> {
        if (!factory) fail('unavailable')
        return new Promise((resolve, reject) => {
            let settled = false
            const request = factory.open('remnacust-editor-recovery-v1', 2)
            request.onupgradeneeded = (event) => {
                const db = request.result
                if (event.oldVersion === 1 && db.objectStoreNames.contains('recovery'))
                    db.deleteObjectStore('recovery')
                if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery')
                if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents')
            }
            request.onerror = request.onblocked = () => {
                settled = true
                reject(new EditorRecoveryError('unavailable'))
            }
            request.onsuccess = () => {
                const db = request.result
                if (settled) {
                    db.close()
                    return
                }
                db.onversionchange = () => db.close()
                resolve(db)
            }
        })
    }
    return {
        async transaction<T>(
            scope: EditorRecoveryScope,
            operation: (
                state: unknown,
                document: unknown
            ) => { state?: unknown; document?: unknown; deleteDocuments?: string[]; value: T },
            readDocument = false
        ): Promise<T> {
            let db: IDBDatabase | undefined
            try {
                db = await database()
                const connection = db
                return await new Promise<T>((resolve, reject) => {
                    const tx = connection.transaction(['recovery', 'documents'], 'readwrite')
                    const store = tx.objectStore('recovery')
                    const documents = tx.objectStore('documents')
                    let result: T
                    let failure: unknown
                    tx.oncomplete = () => resolve(result)
                    tx.onerror = tx.onabort = () => reject(translated(failure, 'unavailable'))
                    const request = store.get('state')
                    const documentRequest = readDocument
                        ? documents.get(documentKey(scope))
                        : undefined
                    let remaining = documentRequest ? 2 : 1
                    const ready = () => {
                        if (--remaining !== 0) return
                        try {
                            const change = operation(request.result, documentRequest?.result)
                            if (
                                !change ||
                                typeof (change as unknown as Promise<unknown>).then === 'function'
                            )
                                fail('corrupt')
                            result = change.value
                            if (change.state !== undefined) store.put(change.state, 'state')
                            for (const key of change.deleteDocuments ?? []) documents.delete(key)
                            if (change.document !== undefined)
                                documents.put(change.document, documentKey(scope))
                        } catch (error) {
                            failure = error
                            tx.abort()
                        }
                    }
                    request.onsuccess = ready
                    if (documentRequest) documentRequest.onsuccess = ready
                })
            } catch (error) {
                throw translated(error, 'unavailable')
            } finally {
                db?.close()
            }
        }
    }
}

export function createEditorRecoveryStore(
    options: {
        storage?: EditorRecoveryStorageAdapter
        crypto?: Crypto
        now?: () => number
    } = {}
) {
    const storage = options.storage ?? createIndexedDbEditorRecoveryStorage()
    const cryptography = options.crypto ?? globalThis.crypto
    const clock = options.now ?? Date.now

    function now(): number {
        const value = clock()
        if (!timestamp(value)) fail('unavailable')
        return value
    }

    function token(): string {
        return Array.from(cryptography.getRandomValues(new Uint8Array(16)), (byte) =>
            byte.toString(16).padStart(2, '0')
        ).join('')
    }

    async function hash(baseline: string): Promise<string> {
        const digest = await cryptography.subtle.digest('SHA-256', encodedText(baseline))
        return Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, '0')
        ).join('')
    }

    async function transaction<T>(
        scope: EditorRecoveryScope,
        operation: (state: State, document: unknown) => T,
        options: { readDocument?: boolean; document?: EncryptedRecovery } = {}
    ): Promise<T> {
        try {
            return await storage.transaction(
                scope,
                (raw, document) => {
                    const state = stateValue(raw)
                    const before = documentKeys(state)
                    const value = operation(state, document)
                    const after = documentKeys(state)
                    return {
                        state,
                        value,
                        document: options.document,
                        deleteDocuments: [...before].filter((key) => !after.has(key))
                    }
                },
                options.readDocument
            )
        } catch (error) {
            throw translated(error, 'unavailable')
        }
    }

    function clear(entry: Entry) {
        delete entry.record
        entry.generation = token()
    }

    function prune(state: State, time: number) {
        for (const owner of state.owners)
            for (const entry of owner.entries)
                if (entry.record && time - entry.record.updatedAt >= EDITOR_RECOVERY_LIMITS.ageMs)
                    clear(entry)
    }

    function find(state: State, scope: EditorRecoveryScope) {
        const owner = state.owners.find((value) => value.owner === scope.owner)
        return {
            owner,
            entry: owner?.entries.find(
                (value) => value.kind === scope.kind && value.id === scope.id
            )
        }
    }

    function enforce(state: State, selected: Entry) {
        const documents = state.owners.flatMap((owner) =>
            owner.entries.filter((entry) => entry.record).map((entry) => ({ owner, entry }))
        )
        let bytes = documents.reduce((sum, item) => sum + item.entry.record!.bytes, 0)
        const counts = new Map<Owner, number>()
        for (const item of documents) counts.set(item.owner, (counts.get(item.owner) ?? 0) + 1)
        documents.sort(
            (left, right) => left.entry.record!.updatedAt - right.entry.record!.updatedAt
        )
        for (const { owner, entry } of documents) {
            if (entry === selected) continue
            if (
                (counts.get(owner) ?? 0) <= EDITOR_RECOVERY_LIMITS.documentsPerOwner &&
                bytes <= EDITOR_RECOVERY_LIMITS.ciphertextBytes
            )
                continue
            bytes -= entry.record!.bytes
            counts.set(owner, counts.get(owner)! - 1)
            clear(entry)
        }
    }

    function aad(
        scope: EditorRecoveryScope,
        baseline: string,
        generation: string,
        record: Pick<EncryptedRecovery, 'updatedAt' | 'writeId' | 'writerId'>
    ) {
        return encoder.encode(
            JSON.stringify([
                'editor-recovery',
                1,
                scope.owner,
                scope.kind,
                scope.id,
                baseline,
                generation,
                record.updatedAt,
                record.writeId,
                record.writerId
            ])
        )
    }

    async function open(
        scope: EditorRecoveryScope,
        baseline: string
    ): Promise<EditorRecoverySession> {
        try {
            scope = scopeValue(scope)
            const baselineHash = await hash(baseline)
            const candidate = await cryptography.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            )
            const opened = await transaction(scope, (state) => {
                const time = now()
                prune(state, time)
                let { owner, entry } = find(state, scope)
                if (!owner) {
                    if (state.owners.length >= MAX_OWNERS) {
                        state.owners.sort((left, right) => left.touchedAt - right.touchedAt)
                        state.owners.shift()
                    }
                    owner = { owner: scope.owner, key: candidate, touchedAt: time, entries: [] }
                    state.owners.push(owner)
                }
                if (!entry) {
                    if (owner.entries.length >= MAX_ENTRIES) {
                        owner.entries.sort(
                            (left, right) =>
                                Number(!!left.record) - Number(!!right.record) ||
                                left.touchedAt - right.touchedAt
                        )
                        owner.entries.shift()
                    }
                    entry = {
                        kind: scope.kind,
                        id: scope.id,
                        baseline: baselineHash,
                        generation: token(),
                        touchedAt: time
                    }
                    owner.entries.push(entry)
                } else if (entry.baseline !== baselineHash) {
                    clear(entry)
                    entry.baseline = baselineHash
                }
                owner.touchedAt = entry.touchedAt = time
                return { generation: entry.generation, key: owner.key }
            })
            let generation = opened.generation
            let baseHash = baselineHash
            let baselineCode = baseline
            const writerId = token()
            let epoch = 0
            let sequence = 0

            async function reset(newBaseline?: string): Promise<void> {
                const previous = generation
                const revision = ++epoch
                sequence++
                try {
                    const nextBaseline =
                        newBaseline === undefined ? baseHash : await hash(newBaseline)
                    const next = token()
                    await transaction(scope, (state) => {
                        const { owner, entry } = find(state, scope)
                        if (revision !== epoch || !owner || !entry || entry.generation !== previous)
                            fail('stale')
                        delete entry.record
                        entry.generation = next
                        entry.baseline = nextBaseline
                        owner.touchedAt = entry.touchedAt = now()
                    })
                    if (revision !== epoch) fail('stale')
                    generation = next
                    baseHash = nextBaseline
                    if (newBaseline !== undefined) baselineCode = newBaseline
                } catch (error) {
                    throw translated(error, 'unavailable')
                }
            }

            return {
                async read() {
                    const expected = generation
                    const revision = epoch
                    const baseline = baseHash
                    const record = await transaction(
                        scope,
                        (state, document) => {
                            prune(state, now())
                            const { entry } = find(state, scope)
                            if (entry?.generation !== expected) return undefined
                            if (entry.baseline !== baseline) {
                                clear(entry)
                                return undefined
                            }
                            return entry.record ? documentValue(document, entry.record) : undefined
                        },
                        { readDocument: true }
                    )
                    if (!record) return null
                    let code: string
                    try {
                        const plaintext = await cryptography.subtle.decrypt(
                            {
                                name: 'AES-GCM',
                                iv: record.iv,
                                additionalData: aad(scope, baseline, expected, record),
                                tagLength: 128
                            },
                            opened.key,
                            record.ciphertext
                        )
                        if (plaintext.byteLength > EDITOR_RECOVERY_LIMITS.textBytes) fail('corrupt')
                        code = new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
                    } catch (error) {
                        throw translated(error, 'corrupt')
                    }
                    const current = await transaction(scope, (state) => {
                        prune(state, now())
                        const { entry } = find(state, scope)
                        return (
                            epoch === revision &&
                            entry?.generation === expected &&
                            entry.baseline === baseline &&
                            entry.record?.writeId === record.writeId
                        )
                    })
                    return current ? { code, updatedAt: record.updatedAt } : null
                },
                async write(code) {
                    const expected = generation
                    const baseline = baseHash
                    const revision = epoch
                    const write = ++sequence
                    try {
                        const plaintext = encodedText(code)
                        if (code === baselineCode) {
                            await transaction(scope, (state) => {
                                prune(state, now())
                                const { entry } = find(state, scope)
                                if (
                                    epoch !== revision ||
                                    sequence !== write ||
                                    !entry ||
                                    entry.generation !== expected ||
                                    entry.baseline !== baseline
                                )
                                    fail('stale')
                                if (entry.record?.writerId === writerId) delete entry.record
                            })
                            return
                        }
                        const iv = cryptography.getRandomValues(new Uint8Array(12))
                        const metadata = { updatedAt: now(), writeId: token(), writerId }
                        const ciphertext = await cryptography.subtle.encrypt(
                            {
                                name: 'AES-GCM',
                                iv,
                                additionalData: aad(scope, baseline, expected, metadata),
                                tagLength: 128
                            },
                            opened.key,
                            plaintext
                        )
                        await transaction(
                            scope,
                            (state) => {
                                prune(state, now())
                                const { owner, entry } = find(state, scope)
                                if (
                                    epoch !== revision ||
                                    sequence !== write ||
                                    !owner ||
                                    !entry ||
                                    entry.generation !== expected ||
                                    entry.baseline !== baseline ||
                                    now() - metadata.updatedAt >= EDITOR_RECOVERY_LIMITS.ageMs
                                )
                                    fail('stale')
                                entry.record = { bytes: ciphertext.byteLength, ...metadata }
                                owner.touchedAt = entry.touchedAt = metadata.updatedAt
                                enforce(state, entry)
                            },
                            { document: { iv, ciphertext, ...metadata } }
                        )
                    } catch (error) {
                        throw translated(error, 'unavailable')
                    }
                },
                discard: () => reset(),
                saved: (newBaseline) => reset(newBaseline)
            }
        } catch (error) {
            throw translated(error, 'unavailable')
        }
    }

    return { open }
}

let browserStore: ReturnType<typeof createEditorRecoveryStore> | undefined

export async function openEditorRecovery(
    scope: EditorRecoveryScope,
    baseline: string
): Promise<EditorRecoverySession> {
    browserStore ??= createEditorRecoveryStore()
    return browserStore.open(scope, baseline)
}

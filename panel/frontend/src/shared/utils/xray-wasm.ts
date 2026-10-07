import { app } from 'src/config'

const LOAD_TIMEOUT = 60_000
let compiled: Promise<WebAssembly.Module> | undefined
let runtime: Promise<void> | undefined
let startup: Promise<void> | undefined

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted()
    return new Promise<T>((resolve, reject) => {
        const aborted = () => reject(signal.reason)
        signal.addEventListener('abort', aborted, { once: true })
        operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
    })
}

function loadRuntime(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (typeof window.Go === 'function') return Promise.resolve()
    if (runtime) return abortable(runtime, signal)
    const pending = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = app.configEditor.wasmJsUrl
        const cleanup = () => {
            signal.removeEventListener('abort', aborted)
            script.onload = script.onerror = null
        }
        const aborted = () => {
            cleanup()
            script.remove()
            reject(signal.reason)
        }
        script.onload = () => {
            cleanup()
            if (typeof window.Go !== 'function') {
                script.remove()
                reject(new Error('The Xray WASM runtime did not initialize'))
            } else resolve()
        }
        script.onerror = () => {
            cleanup()
            script.remove()
            reject(new Error('The Xray WASM runtime could not be downloaded'))
        }
        signal.addEventListener('abort', aborted, { once: true })
        document.head.append(script)
    }).catch((error: unknown) => {
        if (runtime === pending) runtime = undefined
        throw error
    })
    runtime = pending
    return pending
}

// Retain compiled code, not a second 60 MB copy of the downloaded bytes.
export function loadXrayWasm(signal?: AbortSignal): Promise<WebAssembly.Module> {
    signal?.throwIfAborted()
    if (compiled) return compiled
    const controller = new AbortController()
    const aborted = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', aborted, { once: true })
    const timer = setTimeout(
        () => controller.abort(new Error('Xray validator download timed out')),
        LOAD_TIMEOUT
    )
    const pending = abortable(
        (async () => {
            const response = await fetch(app.configEditor.wasmUrl, { signal: controller.signal })
            if (!response.ok) throw new Error(`Xray validator download failed (${response.status})`)
            if (
                response.headers.get('content-type')?.split(';')[0].trim() === 'application/wasm' &&
                typeof WebAssembly.compileStreaming === 'function'
            ) {
                return WebAssembly.compileStreaming(response)
            }
            return WebAssembly.compile(await response.arrayBuffer())
        })(),
        controller.signal
    )
        .catch((error: unknown) => {
            if (compiled === pending) compiled = undefined
            throw error
        })
        .finally(() => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', aborted)
        })
    compiled = pending
    return pending
}

export function initializeXrayWasm(): Promise<void> {
    if (typeof window.XrayParseConfig === 'function') return Promise.resolve()
    if (startup) return startup
    const controller = new AbortController()
    const timer = setTimeout(
        () => controller.abort(new Error('Xray validator initialization timed out')),
        LOAD_TIMEOUT
    )
    const pending = (async () => {
        await loadRuntime(controller.signal)
        const go = new window.Go()
        const module = await abortable(loadXrayWasm(controller.signal), controller.signal)
        const instance = await abortable(
            WebAssembly.instantiate(module, go.importObject),
            controller.signal
        )
        controller.signal.throwIfAborted()
        let ready!: () => void
        let parser: Window['XrayParseConfig'] | undefined
        const initialized = new Promise<void>((resolve) => {
            ready = () => {
                parser = window.XrayParseConfig
                resolve()
            }
        })
        window.onWasmInitialized = ready
        const running = go
            .run(instance)
            .then(() => {
                throw new Error('Xray validator stopped')
            })
            .catch((error: unknown) => {
                if (parser && window.XrayParseConfig === parser)
                    Reflect.deleteProperty(window, 'XrayParseConfig')
                if (startup === pending) startup = undefined
                throw error
            })
        try {
            await abortable(Promise.race([initialized, running]), controller.signal)
            if (typeof window.XrayParseConfig !== 'function')
                throw new Error('Xray validator did not initialize')
        } finally {
            if (window.onWasmInitialized === ready) delete window.onWasmInitialized
        }
    })()
        .catch((error: unknown) => {
            if (startup === pending) startup = undefined
            throw error
        })
        .finally(() => clearTimeout(timer))
    startup = pending
    return pending
}

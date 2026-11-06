import { openEditorRecovery } from './editor-recovery-store'

export interface RecoveredEditorDraft {
    code: string
    updatedAt: number
}

export interface EditorRecoverySnapshot {
    entry: RecoveredEditorDraft | null
    status: 'loading' | 'ready' | 'error'
    error: 'unavailable' | 'too-large' | 'stale' | 'corrupt' | null
}

type RecoveryScope = { owner: string; kind: 'profile' | 'template'; id: string }
type RecoverySession = Awaited<ReturnType<typeof openEditorRecovery>>
type OpenRecovery = (scope: RecoveryScope, baseline: string) => Promise<RecoverySession>

export function recoveryOwner(token: string): string | null {
    try {
        if (token.length > 32_768) return null
        const part = token.split('.')[1]
        if (!part) return null
        const value = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<
            string,
            unknown
        >
        return value.role === 'ADMIN' &&
            typeof value.uuid === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.uuid)
            ? value.uuid
            : null
    } catch {
        return null
    }
}

export class EditorRecoveryController {
    private listeners = new Set<() => void>()
    private snapshot: EditorRecoverySnapshot = { entry: null, status: 'loading', error: null }
    private session: RecoverySession | null = null
    private ready: Promise<void> = Promise.resolve()
    private started = false
    private serial: Promise<unknown> = Promise.resolve()
    private timer: ReturnType<typeof setTimeout> | undefined
    private version = 0
    private needsSave = false
    private code: string
    private baseline: string

    constructor(
        private readonly scope: RecoveryScope,
        baseline: string,
        private readonly open: OpenRecovery = openEditorRecovery
    ) {
        this.code = this.baseline = baseline
    }

    readonly start = (): Promise<void> => {
        if (!this.started) {
            this.started = true
            this.ready = this.initialize()
        }
        return this.ready
    }

    private async initialize(): Promise<void> {
        try {
            this.session = null
            this.session = await this.open(this.scope, this.baseline)
            this.publish(await this.session.read())
        } catch (error) {
            this.fail(error)
        }
    }

    readonly subscribe = (listener: () => void) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    readonly getSnapshot = () => this.snapshot

    private publish(entry: RecoveredEditorDraft | null): void {
        this.snapshot = { entry, status: 'ready', error: null }
        for (const listener of this.listeners) listener()
    }

    private fail(error: unknown): void {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null
        this.snapshot = {
            ...this.snapshot,
            ...(code === 'stale' ? { entry: null } : {}),
            status: 'error',
            error:
                code === 'too-large' || code === 'stale' || code === 'corrupt'
                    ? code
                    : 'unavailable'
        }
        for (const listener of this.listeners) listener()
    }

    private enqueue<T>(action: () => Promise<T>): Promise<T> {
        const next = this.serial.catch(() => {}).then(action)
        this.serial = next.catch((error) => this.fail(error))
        return next
    }

    private clearTimer(): void {
        if (this.timer) clearTimeout(this.timer)
        this.timer = undefined
    }

    readonly track = (code: string): void => {
        if (this.code === code) return
        this.code = code
        this.version++
        this.needsSave = true
        this.clearTimer()
        this.timer = setTimeout(
            () => void this.flush().catch(() => {}),
            code.length > 512 * 1024 ? 1000 : 200
        )
    }

    readonly flush = async (): Promise<void> => {
        this.clearTimer()
        if (!this.needsSave) {
            await this.serial
            return
        }
        const version = this.version
        const code = this.code
        await this.enqueue(async () => {
            await this.start()
            if (version !== this.version || !this.needsSave) return
            if (!this.session) throw new Error('Recovery storage unavailable')
            await this.session.write(code)
            if (version === this.version) this.needsSave = false
            this.publish(await this.session.read())
        })
        if (this.needsSave) await this.flush()
    }

    readonly saved = async (baseline: string, submitted: string): Promise<void> => {
        this.clearTimer()
        this.version++
        this.baseline = baseline
        if (this.code === submitted) this.code = baseline
        this.needsSave = this.code !== baseline
        await this.enqueue(async () => {
            await this.start()
            if (!this.session) throw new Error('Recovery storage unavailable')
            try {
                await this.session.saved(baseline)
            } catch (error) {
                if (
                    !error ||
                    typeof error !== 'object' ||
                    !('code' in error) ||
                    error.code !== 'stale'
                )
                    throw error
                this.session = await this.open(this.scope, baseline)
                await this.session.saved(baseline)
            }
            this.publish(null)
        })
        if (this.needsSave) await this.flush()
    }

    readonly rebase = async (baseline: string): Promise<void> => {
        if (this.baseline === baseline) return
        this.clearTimer()
        this.version++
        if (this.code === this.baseline) this.code = baseline
        this.baseline = baseline
        this.needsSave = false
        await this.enqueue(async () => {
            await this.start()
            this.session = null
            this.session = await this.open(this.scope, baseline)
            this.publish(await this.session.read())
        })
    }

    readonly discard = async (): Promise<void> => {
        this.clearTimer()
        this.version++
        this.needsSave = false
        await this.enqueue(async () => {
            await this.start()
            if (!this.session) throw new Error('Recovery storage unavailable')
            await this.session.discard()
            this.publish(null)
        })
        if (this.needsSave) await this.flush()
    }

    readonly retry = async (): Promise<void> => {
        this.started = true
        this.ready = this.initialize()
        await this.ready
        if (this.needsSave) await this.flush()
    }

    readonly refresh = async (): Promise<void> => {
        await this.enqueue(async () => {
            await this.start()
            if (this.session) this.publish(await this.session.read())
        })
    }
}

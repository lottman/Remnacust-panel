import consola from 'consola/browser'

type Listener = () => void
type Unsubscribe = () => void

class LogoutEventEmitter {
    private listeners: Set<Listener> = new Set()
    private channel: BroadcastChannel | undefined
    private readonly storageKey = 'rw-logout'

    constructor() {
        if (typeof window === 'undefined') return

        if (typeof BroadcastChannel !== 'undefined') {
            this.channel = new BroadcastChannel(this.storageKey)
            this.channel.addEventListener('message', (event) => {
                if (event.data === 'logout') this.notify()
            })
        }
        window.addEventListener('storage', (event) => {
            if (event.key === this.storageKey && event.newValue) this.notify()
        })
    }

    emit() {
        // Remote notifications must not be broadcast again.
        try {
            if (this.channel) this.channel.postMessage('logout')
            else window.localStorage.setItem(this.storageKey, `${Date.now()}:${Math.random()}`)
        } catch {
            // Storage restrictions must never prevent logout in this tab.
        }
        this.notify()
    }

    private notify() {
        this.listeners.forEach((listener) => {
            try {
                listener()
            } catch (error) {
                consola.error('logout listener failed', error)
            }
        })
    }

    subscribe(listener: Listener): Unsubscribe {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }
}

export const logoutEvents = new LogoutEventEmitter()

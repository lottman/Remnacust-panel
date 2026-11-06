const flushers = new Set<() => Promise<void>>()

export function registerEditorRecovery(flush: () => Promise<void>): () => void {
    flushers.add(flush)
    return () => {
        flushers.delete(flush)
    }
}

export async function flushEditorRecoveries(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        await Promise.race([
            Promise.all([...flushers].map((flush) => flush())),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Recovery flush timed out')), 8000)
            })
        ])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

const schemas = new Map<string, Promise<unknown>>()

export async function loadEditorSchema<T = Record<string, unknown>>(url: string): Promise<T> {
    let pending = schemas.get(url)
    if (!pending) {
        pending = fetch(url, { signal: AbortSignal.timeout(30_000) })
            .then(async (response) => {
                if (!response.ok)
                    throw new Error(`Editor schema download failed (${response.status})`)
                return response.json() as Promise<unknown>
            })
            .catch((error: unknown) => {
                schemas.delete(url)
                throw error
            })
        schemas.set(url, pending)
    }
    // Editors add their own snippet definitions; never mutate the cached base schema.
    return structuredClone(await pending) as T
}

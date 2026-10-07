/** REALITY shortIds accept up to eight bytes encoded as an even-length hex string. */
export function generateShortId(randomSource: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
    const bytes = new Uint8Array(8)
    randomSource.getRandomValues(bytes)
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

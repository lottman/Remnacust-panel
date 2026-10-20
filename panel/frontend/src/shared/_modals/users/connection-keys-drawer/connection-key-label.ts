export function connectionKeyLabel(link: string): string {
    const encoded = link.split('#').at(-1) || 'Host'
    try {
        return decodeURIComponent(encoded)
    } catch {
        return encoded
    }
}

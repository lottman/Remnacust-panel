export function decodePanelData(value: string): unknown {
    const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0))
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

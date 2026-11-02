import { renderSVG } from 'uqr'

export function qrSvg(data: string, foreground: string, background: string): string | null {
    if (typeof data !== 'string' || !data.trim()) return null
    try {
        return renderSVG(data, { border: 4, blackColor: foreground, whiteColor: background })
    } catch {
        return null
    }
}

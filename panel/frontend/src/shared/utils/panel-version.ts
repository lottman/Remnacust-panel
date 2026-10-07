import semver from 'semver'

function parsePanelVersion(value: string) {
    const match = /^v?(\d+\.\d+\.\d+)(?:\.(\d+))?((?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(value)
    if (!match) return null
    const base = semver.parse(match[1] + match[3])
    const revision = Number(match[2] ?? 0)
    return base && Number.isSafeInteger(revision) ? { base, revision } : null
}

export function isValidPanelVersion(value: string): boolean {
    return parsePanelVersion(value) !== null
}

export function isPanelVersionNewer(latest: string, current: string): boolean {
    const a = parsePanelVersion(latest)
    const b = parsePanelVersion(current)
    if (!a || !b) return false
    const order = semver.compare(a.base, b.base)
    return order > 0 || (order === 0 && a.revision > b.revision)
}

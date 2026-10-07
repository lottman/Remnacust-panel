import semver from 'semver'

export const MIN_REMNACUST_NODE_VERSION = '1.1.1'
export const MIN_REMNAWAVE_NODE_VERSION = '3.3.0'

export function supportsNodeGeocheck(nodeVersion: string | null | undefined): boolean {
    const version = semver.parse(nodeVersion ?? '')
    if (!version) return false

    const isRemnacust = [...version.prerelease, ...version.build].some(
        (part) => typeof part === 'string' && part.toLowerCase() === 'remnacust'
    )
    const minimum = isRemnacust ? MIN_REMNACUST_NODE_VERSION : MIN_REMNAWAVE_NODE_VERSION
    return semver.gte(`${version.major}.${version.minor}.${version.patch}`, minimum)
}

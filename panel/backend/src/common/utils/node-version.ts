import semver from 'semver';

// Remnacust has its own release sequence. A wire suffix distinguishes our
// maintained node from legacy Remnawave nodes with the same numeric version.
export function nodeSupportsFeature(version: unknown, upstreamMinimum: string): boolean {
    if (typeof version !== 'string') return false;
    const parsed = semver.parse(version);
    if (!parsed) return false;
    const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
    if (parsed.prerelease.includes('remnacust')) return semver.gte(base, '1.1.1');
    return semver.gte(base, upstreamMinimum);
}

export const nodeSupportsPlugins = (version: unknown): boolean =>
    nodeSupportsFeature(version, '2.7.0');
export const nodeSupportsCompression = (version: unknown): boolean =>
    nodeSupportsFeature(version, '2.3.0');
export const nodeSupportsWrappedConfig = nodeSupportsCompression;
export const nodeSupportsBulkUsers = (version: unknown): boolean =>
    nodeSupportsFeature(version, '2.5.0');

import { createHash } from 'node:crypto';

export async function stabilizeRoutingProfile(
    header: string,
    intervalHours: number | undefined,
    revision: (key: string, fingerprint: string, minimum: number) => Promise<number | null>,
    credentialScope = '',
    sourceRevision?: string,
): Promise<string | undefined> {
    const match = /^(happ|incy):\/\/routing\/onadd\/(.+)$/.exec(header);
    if (!match || Buffer.byteLength(header) > 3000)
        throw new Error('Invalid generated routing profile');
    const profile = JSON.parse(Buffer.from(match[2], 'base64').toString('utf8'));
    const minimum = Number(profile.LastUpdated);
    if (
        !Number.isSafeInteger(minimum) ||
        minimum < 0 ||
        minimum >= 1e12 ||
        typeof profile.Name !== 'string'
    )
        throw new Error('Invalid generated routing revision');
    delete profile.LastUpdated;
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const key = digest(JSON.stringify([match[1], profile.Name, credentialScope]));
    if (sourceRevision !== undefined && !/^[a-f0-9]{64}$/.test(sourceRevision))
        throw new Error('Invalid geofile source revision');
    const fingerprint = digest(
        JSON.stringify({ profile, intervalHours, ...(sourceRevision ? { sourceRevision } : {}) }),
    );
    const value = await revision(key, fingerprint, minimum);
    if (value === null) return undefined;
    if (!Number.isSafeInteger(value) || value < 0 || value >= 1e12)
        throw new Error('Invalid stored routing revision');
    profile.LastUpdated = String(value);
    const result = `${match[1]}://routing/onadd/${Buffer.from(JSON.stringify(profile)).toString('base64')}`;
    if (Buffer.byteLength(result) > 3000) throw new Error('Generated routing profile is too large');
    return result;
}

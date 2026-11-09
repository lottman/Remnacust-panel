import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BundleSelection {
    kind: 'geoip' | 'geosite';
    ids: string[];
    namespace: 2;
    revision?: string;
    categories: Record<string, string[]>;
}

const MAX_SELECTION_BYTES = 256 * 1024;
const MAX_SELECTIONS_PER_FILE = 128;
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');

export function validateBundleSelection(value: BundleSelection): BundleSelection {
    if (
        !value ||
        !['geoip', 'geosite'].includes(value.kind) ||
        value.namespace !== 2 ||
        (value.revision !== undefined &&
            (typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision))) ||
        !Array.isArray(value.ids) ||
        !value.ids.length ||
        value.ids.length > 32 ||
        value.ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{34}$/.test(id)) ||
        new Set(value.ids).size !== value.ids.length ||
        !value.categories ||
        typeof value.categories !== 'object' ||
        Array.isArray(value.categories) ||
        Object.keys(value.categories).length !== value.ids.length
    )
        throw Error('geofile-bundle-selection');
    let count = 0;
    for (const id of value.ids) {
        const categories = value.categories[id];
        if (
            !Array.isArray(categories) ||
            !categories.length ||
            categories.some(
                (category) =>
                    typeof category !== 'string' ||
                    category.length > 2048 ||
                    !/^[a-z0-9_.!+-]+$/.test(category),
            ) ||
            new Set(categories).size !== categories.length ||
            (count += categories.length) > 1024
        )
            throw Error('geofile-bundle-selection');
    }
    return value;
}

export async function readBundleSelection(
    directory: string,
    key: string,
): Promise<BundleSelection> {
    if (!/^m-[a-f0-9]{64}$/.test(key)) throw Error('geofile-bundle-selection');
    const handle = await open(
        join(directory, `selection-${key.slice(2)}.json`),
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SELECTION_BYTES)
            throw Error('geofile-bundle-selection');
        const data = await handle.readFile();
        if (digest(data) !== key.slice(2)) throw Error('geofile-bundle-selection');
        return validateBundleSelection(JSON.parse(data.toString('utf8')));
    } finally {
        await handle.close();
    }
}

export async function storeBundleSelection(
    directory: string,
    selection: BundleSelection,
): Promise<string | undefined> {
    validateBundleSelection(selection);
    const data = Buffer.from(JSON.stringify(selection));
    if (data.length > MAX_SELECTION_BYTES) return;
    const key = 'm-' + digest(data);
    try {
        await readBundleSelection(directory, key);
        return key;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const files = await readdir(directory);
    if (
        files.filter((name) => /^selection-[a-f0-9]{64}\.json$/.test(name)).length >=
        MAX_SELECTIONS_PER_FILE
    )
        return;
    const temporary = join(directory, `.selection-${randomBytes(16).toString('hex')}`);
    try {
        await writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
        try {
            await link(temporary, join(directory, `selection-${key.slice(2)}.json`));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            await readBundleSelection(directory, key);
        }
    } finally {
        await unlink(temporary).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
        });
    }
    return key;
}

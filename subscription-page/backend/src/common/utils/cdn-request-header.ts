import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const legacyName = 'x-remnacust-cdn';
const randomName = /^x-[a-f0-9]{24}$/i;
const uuidValue = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

// The UUID is random and persistent. Derivation keeps this public routing label
// stable across upgrades and identical in independently deployed components.
// Neither this name nor the UUID is an authentication credential.
export function cdnRequestHeaderName(uuid: string): string {
    return 'X-' + createHash('sha256').update('cdn-selector-v1:' + uuid).digest('hex').slice(0, 24);
}

export function isCdnSelectorHeader(name: string): boolean {
    return name.toLowerCase() === legacyName || randomName.test(name);
}

export function consumeCdnSelector(headers: IncomingHttpHeaders | undefined): {
    uuid?: string;
    invalid: boolean;
} {
    let uuid: string | undefined;
    let invalid = false;
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!isCdnSelectorHeader(name)) continue;
        delete headers![name];
        if (typeof value !== 'string' || !uuidValue.test(value) ||
            (name.toLowerCase() !== legacyName && name.toLowerCase() !== cdnRequestHeaderName(value).toLowerCase()) ||
            (uuid !== undefined && uuid !== value)) {
            invalid = true;
            continue;
        }
        uuid = value;
    }
    return { uuid, invalid };
}

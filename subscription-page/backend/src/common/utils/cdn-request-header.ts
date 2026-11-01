import { createHmac } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

const legacyName = 'x-remnacust-cdn';
const randomName = /^x-[a-f0-9]{24}$/i;
const uuidValue = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

// A domain-separated MAC prevents public IDs from revealing a cross-installation
// name/value relationship. This public selector never serves as authentication.
export function cdnRequestHeaderName(uuid: string, key: string): string {
    return 'X-' + createHmac('sha256', key).update('cdn-selector-name-v1:' + uuid).digest('hex').slice(0, 24);
}

export function isCdnSelectorHeader(name: string): boolean {
    return name.toLowerCase() === legacyName || randomName.test(name);
}

export function consumeCdnSelector(headers: IncomingHttpHeaders | undefined): {
    uuid?: string;
    name?: string;
    invalid: boolean;
} {
    let uuid: string | undefined;
    let invalid = false;
    let selectedName: string | undefined;
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!isCdnSelectorHeader(name)) continue;
        delete headers![name];
        if (typeof value !== 'string' || !uuidValue.test(value) ||
            (uuid !== undefined && uuid !== value)) {
            invalid = true;
            continue;
        }
        if (name.toLowerCase() !== legacyName) {
            if (selectedName !== undefined && selectedName !== name.toLowerCase()) invalid = true;
            selectedName = name.toLowerCase();
        }
        uuid = value;
    }
    return { uuid, invalid, ...(selectedName ? { name: selectedName } : {}) };
}

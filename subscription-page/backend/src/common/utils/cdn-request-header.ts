import type { IncomingHttpHeaders } from 'node:http';

import { createHmac } from 'node:crypto';

const legacyName = 'x-remnacust-cdn';
const randomName = /^x-[a-f0-9]{24}$/i;
const uuidValue = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

// A domain-separated MAC prevents public IDs from revealing a cross-installation
// name/value relationship. This public selector never serves as authentication.
export function cdnRequestHeaderName(uuid: string, key: string): string {
    return (
        'X-' +
        createHmac('sha256', key)
            .update('cdn-selector-name-v1:' + uuid)
            .digest('hex')
            .slice(0, 24)
    );
}

export function isCdnSelectorHeader(name: string): boolean {
    return name.toLowerCase() === legacyName || randomName.test(name);
}

export function consumeCdnSelector(headers: IncomingHttpHeaders | undefined): {
    uuid?: string;
    name?: string;
    proof?: string;
    invalid: boolean;
} {
    let uuid: string | undefined;
    let invalid = false;
    let selectedName: string | undefined;
    let proof: string | undefined;
    let unsigned = false;
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!isCdnSelectorHeader(name)) continue;
        delete headers![name];
        const parts = typeof value === 'string' ? value.split('.') : [];
        const id = parts[0];
        const token = parts[1];
        if (
            !id ||
            !uuidValue.test(id) ||
            parts.length > 2 ||
            (parts.length === 2 &&
                (!token || !/^[a-f0-9]{64}$/.test(token) || name.toLowerCase() === legacyName)) ||
            (uuid !== undefined && uuid !== id) ||
            (proof !== undefined && token !== proof) ||
            (token !== undefined && unsigned)
        ) {
            invalid = true;
            continue;
        }
        if (name.toLowerCase() !== legacyName) {
            if (selectedName !== undefined && selectedName !== name.toLowerCase()) invalid = true;
            selectedName = name.toLowerCase();
        }
        uuid = id;
        if (token) proof = token;
        else unsigned = true;
    }
    return {
        uuid,
        invalid,
        ...(selectedName ? { name: selectedName } : {}),
        ...(proof ? { proof } : {}),
    };
}

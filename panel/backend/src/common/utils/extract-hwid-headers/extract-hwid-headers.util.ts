import { Request } from 'express';

import { truncateHeader } from '../truncate-header.util';

export interface HwidHeaders {
    hwid: string;
    platform?: string;
    osVersion?: string;
    deviceModel?: string;
    userAgent?: string;
}

const HWID_REGEX = /^[a-zA-Z0-9=-]{10,64}$/;

export function extractHwidHeaders(request: Request): HwidHeaders | null {
    // INCY Android may send X-Device-ID as an alias for x-hwid.
    const rawHwid = request.headers['x-hwid'] ?? request.headers['x-device-id'];
    const hwid = Array.isArray(rawHwid) ? rawHwid[0] : rawHwid;
    const rawAlias = request.headers['x-device-id'];
    const alias = Array.isArray(rawAlias) ? rawAlias[0] : rawAlias;

    if (!hwid || !HWID_REGEX.test(hwid) || (alias && alias !== hwid)) {
        return null;
    }

    return {
        hwid,
        platform: truncateHeader(request.headers['x-device-os']),
        osVersion: truncateHeader(request.headers['x-ver-os']),
        deviceModel: truncateHeader(request.headers['x-device-model']),
        userAgent: truncateHeader(request.headers['user-agent']),
    };
}

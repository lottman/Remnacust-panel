import { CipherType } from '@remnawave/node-contract';
import { createHash } from 'node:crypto';

export enum ShadowsocksMethod {
    AES_128_GCM = 'aes-128-gcm',
    AES_256_GCM = 'aes-256-gcm',
    CHACHA20_IETF_POLY1305 = 'chacha20-ietf-poly1305',
    SS2022_BLAKE3_AES_128_GCM = '2022-blake3-aes-128-gcm',
    SS2022_BLAKE3_AES_256_GCM = '2022-blake3-aes-256-gcm',
}

export const SHADOWSOCKS_METHODS = [
    ShadowsocksMethod.AES_128_GCM,
    ShadowsocksMethod.AES_256_GCM,
    ShadowsocksMethod.CHACHA20_IETF_POLY1305,
    ShadowsocksMethod.SS2022_BLAKE3_AES_128_GCM,
    ShadowsocksMethod.SS2022_BLAKE3_AES_256_GCM,
];

type RawInbound = {
    settings?: {
        method?: string;
        [key: string]: any;
    };
    [key: string]: any;
} | null;

function getMethodFromRawInbound(rawInbound: RawInbound): string | undefined {
    return rawInbound?.settings?.method;
}

export function getCipherTypeFromString(rawInbound: RawInbound): CipherType {
    const method = getMethodFromRawInbound(rawInbound);
    switch (method) {
        case ShadowsocksMethod.CHACHA20_IETF_POLY1305:
            return CipherType.CHACHA20_POLY1305;
        case ShadowsocksMethod.AES_128_GCM:
            return CipherType.AES_128_GCM;
        case ShadowsocksMethod.AES_256_GCM:
            return CipherType.AES_256_GCM;
        default:
            return CipherType.CHACHA20_POLY1305;
    }
}

export function isSS2022Method(rawInbound: RawInbound): boolean {
    return isSS2022MethodFromMethod(getMethodFromRawInbound(rawInbound));
}

export function isSS2022MethodFromMethod(method: string | undefined): boolean {
    if (!method) {
        return false;
    }
    return method === ShadowsocksMethod.SS2022_BLAKE3_AES_128_GCM ||
        method === ShadowsocksMethod.SS2022_BLAKE3_AES_256_GCM;
}

export function getDecodedKeySize(password: string): number {
    try {
        // Node's base64 decoder silently discards invalid characters; Xray's
        // server decoder rejects them. Accept the same padded alphabet here.
        const encoded = password.replace(/[\r\n]/g, '');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return 0;
        return Buffer.from(encoded, 'base64').length;
    } catch {
        return 0;
    }
}

export function getSS2022KeySize(method: string | undefined): number {
    return method === ShadowsocksMethod.SS2022_BLAKE3_AES_128_GCM ? 16 : 32;
}

export function encodeSS2022Password(password: string, method?: string): string {
    const key = Buffer.from(password);
    const size = getSS2022KeySize(method);
    if (key.length < size) throw new Error(`SS2022 user key must contain at least ${size} bytes.`);
    // Keep AES-256 credentials unchanged. Derive AES-128 from the entire secret,
    // retaining its entropy and distinguishing accounts with a shared prefix.
    const derived = size === 16 ? createHash('sha256').update(key).digest() : key;
    return derived.subarray(0, size).toString('base64');
}

export function getSsPassword(password: string, isSS2022: boolean, method?: string): string {
    return isSS2022 ? encodeSS2022Password(password, method) : password;
}

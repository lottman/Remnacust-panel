import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';

const MAX_PEM_BYTES = 128 * 1024;
const PEM_LABELS = new Set([
    'CERTIFICATE',
    'PRIVATE KEY',
    'RSA PRIVATE KEY',
    'EC PRIVATE KEY',
    'ENCRYPTED PRIVATE KEY',
]);

export class UnsafePemFileError extends Error {
    constructor() {
        super('Invalid or unsafe PEM file');
    }
}

export interface IResolvedPemCert {
    cert: string[];
    key: string[];
    name: string;
}

export function readPemLines(filePath: string): string[] {
    // O_NONBLOCK prevents opening a FIFO from waiting for a writer. Check the
    // opened descriptor, not a path that can change between stat and read.
    const fd = openSync(filePath, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    let content: string;
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size > MAX_PEM_BYTES) throw new UnsafePemFileError();
        const buffer = Buffer.alloc(MAX_PEM_BYTES + 1);
        let length = 0;
        while (length < buffer.length) {
            const read = readSync(fd, buffer, length, buffer.length - length, null);
            if (!read) break;
            length += read;
        }
        if (length > MAX_PEM_BYTES) throw new UnsafePemFileError();
        content = buffer.subarray(0, length).toString('utf8');
    } finally {
        closeSync(fd);
    }

    const lines = content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter((line) => line.trim());
    let label: string | null = null;
    let hasBody = false;
    let blocks = 0;
    for (const line of lines) {
        if (label === null) {
            const begin = /^-----BEGIN ([A-Z ]+)-----$/.exec(line);
            if (!begin || !PEM_LABELS.has(begin[1])) throw new UnsafePemFileError();
            label = begin[1];
            hasBody = false;
        } else if (line === `-----END ${label}-----`) {
            if (!hasBody) throw new UnsafePemFileError();
            blocks++;
            label = null;
        } else {
            if (!/^[A-Za-z0-9+/=]+$/.test(line)) throw new UnsafePemFileError();
            hasBody = true;
        }
    }
    if (label !== null || !blocks) throw new UnsafePemFileError();
    return lines;
}

export function resolvePemCerts(certs: unknown): IResolvedPemCert[] {
    if (!Array.isArray(certs)) {
        return [];
    }

    const rawCerts = certs as {
        cert: string | string[];
        key: string | string[];
        name: string;
    }[];

    const resolvedCerts: IResolvedPemCert[] = [];

    for (const cert of rawCerts) {
        try {
            if (Array.isArray(cert.cert) || Array.isArray(cert.key)) {
                continue;
            }

            resolvedCerts.push({
                cert: readPemLines(cert.cert),
                key: readPemLines(cert.key),
                name: cert.name,
            });
        } catch {
            // silence
        }
    }

    return resolvedCerts;
}

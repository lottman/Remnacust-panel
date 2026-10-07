import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
    scrypt,
    timingSafeEqual,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, writeFile } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const magic = Buffer.from('XRBKP002');
const setupSaltLength = 16;
const saltLength = 16;
const ivLength = 12;
const tagLength = 16;
const headerLength = magic.length + setupSaltLength + saltLength + ivLength;
export const backupKeyLength = setupSaltLength + 32;

export async function createBackupKey(password: Buffer): Promise<Buffer> {
    const setupSalt = randomBytes(setupSaltLength);
    const key = (await deriveKey(password, setupSalt, 32)) as Buffer;
    return Buffer.concat([setupSalt, key]);
}

export async function matchesBackupPassword(password: Buffer, backupKey: Buffer): Promise<boolean> {
    if (backupKey.length !== backupKeyLength) throw new Error('Invalid backup key');
    const derived = (await deriveKey(
        password,
        backupKey.subarray(0, setupSaltLength),
        32,
    )) as Buffer;
    try {
        return timingSafeEqual(derived, backupKey.subarray(setupSaltLength));
    } finally {
        derived.fill(0);
    }
}

export async function encryptBackup(
    source: Readable,
    target: string,
    backupKey: Buffer,
): Promise<void> {
    if (backupKey.length !== backupKeyLength) throw new Error('Invalid backup key');
    const salt = randomBytes(saltLength);
    const iv = randomBytes(ivLength);
    const key = (await deriveKey(backupKey.subarray(setupSaltLength), salt, 32)) as Buffer;
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    key.fill(0);
    await writeFile(
        target,
        Buffer.concat([magic, backupKey.subarray(0, setupSaltLength), salt, iv]),
        { flag: 'wx', mode: 0o600 },
    );
    await pipeline(source, cipher, createWriteStream(target, { flags: 'a' }));
    await appendFile(target, cipher.getAuthTag());
}

export async function decryptBackup(
    source: string,
    destination: Writable,
    backupKey: Buffer,
): Promise<void> {
    if (backupKey.length !== backupKeyLength) throw new Error('Invalid backup key');
    const file = await open(source, 'r');
    let header: Buffer;
    let tag: Buffer;
    let size: number;
    try {
        size = (await file.stat()).size;
        if (size < headerLength + tagLength) throw new Error('Truncated encrypted backup');
        header = Buffer.alloc(headerLength);
        tag = Buffer.alloc(tagLength);
        if ((await file.read(header, 0, headerLength, 0)).bytesRead !== headerLength) {
            throw new Error('Truncated backup header');
        }
        if ((await file.read(tag, 0, tagLength, size - tagLength)).bytesRead !== tagLength) {
            throw new Error('Truncated backup authentication tag');
        }
    } finally {
        await file.close();
    }
    if (!header.subarray(0, magic.length).equals(magic)) {
        throw new Error('Unsupported encrypted backup format');
    }
    const setupSalt = header.subarray(magic.length, magic.length + setupSaltLength);
    if (!timingSafeEqual(setupSalt, backupKey.subarray(0, setupSaltLength))) {
        throw new Error('Backup key does not match this file');
    }
    const salt = header.subarray(
        magic.length + setupSaltLength,
        magic.length + setupSaltLength + saltLength,
    );
    const iv = header.subarray(magic.length + setupSaltLength + saltLength);
    const key = (await deriveKey(backupKey.subarray(setupSaltLength), salt, 32)) as Buffer;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    key.fill(0);
    decipher.setAuthTag(tag);
    await pipeline(
        createReadStream(source, { start: headerLength, end: size - tagLength - 1 }),
        decipher,
        destination,
    );
}

export async function verifyBackup(source: string, backupKey: Buffer): Promise<void> {
    await decryptBackup(
        source,
        new Writable({
            write(_chunk, _encoding, callback) {
                callback();
            },
        }),
        backupKey,
    );
}

export async function decryptBackupWithPassword(
    source: string,
    destination: Writable,
    password: Buffer,
): Promise<void> {
    const file = await open(source, 'r');
    const prefix = Buffer.alloc(magic.length + setupSaltLength);
    try {
        if ((await file.read(prefix, 0, prefix.length, 0)).bytesRead !== prefix.length) {
            throw new Error('Truncated backup header');
        }
    } finally {
        await file.close();
    }
    if (!prefix.subarray(0, magic.length).equals(magic)) {
        throw new Error('Unsupported encrypted backup format');
    }
    const setupSalt = prefix.subarray(magic.length);
    const key = (await deriveKey(password, setupSalt, 32)) as Buffer;
    const backupKey = Buffer.concat([setupSalt, key]);
    key.fill(0);
    try {
        await decryptBackup(source, destination, backupKey);
    } finally {
        backupKey.fill(0);
    }
}

import { BlobReader, ZipReader, ZipWriter } from '@zip.js/zip.js';
import { createWriteStream, openAsBlob } from 'node:fs';
import { Readable, Writable } from 'node:stream';

export async function writeEncryptedBackupZip(
    source: Readable,
    target: string,
    password: string,
): Promise<void> {
    const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
    const writer = new ZipWriter(Writable.toWeb(output), {
        password,
        zip64: true,
    });

    try {
        await writer.add(
            'database.dump',
            Readable.toWeb(source) as unknown as ReadableStream<Uint8Array>,
            { compressionMethod: 0 },
        );
        await writer.close();
    } catch (error) {
        source.destroy();
        output.destroy();
        throw error;
    }
}

export async function verifyEncryptedBackupZip(path: string, password: string): Promise<void> {
    const reader = new ZipReader(new BlobReader(await openAsBlob(path)), { password });
    try {
        const entries = await reader.getEntries();
        if (
            entries.length !== 1 ||
            entries[0].filename !== 'database.dump' ||
            entries[0].directory ||
            !entries[0].encrypted ||
            entries[0].zipCrypto
        ) {
            throw new Error('Unexpected backup ZIP contents');
        }

        await entries[0].getData(
            new WritableStream({
                write() {
                    // Read through the entry to verify the ZIP AES authentication code.
                },
            }),
        );
    } finally {
        await reader.close();
    }
}

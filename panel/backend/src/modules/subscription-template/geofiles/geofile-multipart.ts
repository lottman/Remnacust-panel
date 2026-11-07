import type { Request } from 'express';

import busboy from 'busboy';

import { MAX_GEOFILE_BYTES } from './download-geofile';
import { parseGeofileSelections } from './geofile-editor';

export interface GeofileCopyData {
    name: unknown;
    selections?: unknown;
    data: Buffer;
}

export function readGeofileMultipart(request: Request): Promise<GeofileCopyData> {
    return new Promise((resolve, reject) => {
        const maximum = MAX_GEOFILE_BYTES + 128 * 1024;
        let parser: ReturnType<typeof busboy>;
        try {
            if (
                !/^multipart\/form-data\s*;/i.test(request.headers['content-type'] ?? '') ||
                Number(request.headers['content-length'] ?? 0) > maximum
            )
                throw Error('geofile-multipart');
            parser = busboy({
                headers: request.headers,
                limits: {
                    files: 1,
                    fields: 1,
                    parts: 3,
                    fileSize: MAX_GEOFILE_BYTES + 1,
                    fieldSize: 32 * 1024 + 1,
                    fieldNameSize: 32,
                },
                highWaterMark: 16 * 1024,
                fileHwm: 64 * 1024,
            });
        } catch {
            reject(Error('geofile-multipart'));
            return;
        }
        const chunks: Buffer[] = [];
        let size = 0,
            received = 0,
            fileCount = 0,
            fieldCount = 0,
            ended = false,
            settled = false;
        let metadata: { name: unknown; selections: unknown } | undefined;
        const cleanup = () => {
            clearTimeout(timer);
            request.off('data', countBytes);
            request.off('aborted', aborted);
            request.off('error', failed);
            request.off('close', closed);
        };
        const failed = () => {
            if (settled) return;
            settled = true;
            cleanup();
            chunks.length = 0;
            request.unpipe(parser);
            request.resume();
            if (request.res && !request.res.headersSent) {
                request.res.setHeader('Connection', 'close');
                request.res.once('finish', () => request.destroy());
            }
            queueMicrotask(() => parser.destroy());
            reject(Error('geofile-multipart'));
        };
        const aborted = () => failed();
        const closed = () => {
            if (!request.complete) failed();
        };
        const countBytes = (chunk: Buffer) => {
            received += chunk.length;
            if (received > maximum) failed();
        };
        const timer = setTimeout(() => {
            failed();
            request.destroy();
        }, 30_000);
        request.on('data', countBytes);
        request.once('aborted', aborted);
        request.once('error', failed);
        request.once('close', closed);
        parser.on('file', (name, stream) => {
            if (settled || name !== 'file' || ++fileCount !== 1) {
                stream.resume();
                failed();
                return;
            }
            stream.on('error', failed);
            stream.once('limit', failed);
            stream.on('data', (chunk: Buffer) => {
                if (settled) return;
                size += chunk.length;
                if (size > MAX_GEOFILE_BYTES) {
                    failed();
                    return;
                }
                chunks.push(chunk);
            });
            stream.once('end', () => {
                ended = !stream.truncated;
            });
        });
        parser.on('field', (name, value, info) => {
            if (settled) return;
            try {
                if (
                    name !== 'metadata' ||
                    ++fieldCount !== 1 ||
                    info.nameTruncated ||
                    info.valueTruncated ||
                    Buffer.byteLength(value) > 32 * 1024
                )
                    throw Error('geofile-multipart');
                const parsed: unknown = JSON.parse(value);
                if (
                    !parsed ||
                    typeof parsed !== 'object' ||
                    Array.isArray(parsed) ||
                    Object.keys(parsed).some((key) => !['name', 'selections'].includes(key)) ||
                    typeof (parsed as { name?: unknown }).name !== 'string'
                )
                    throw Error('geofile-multipart');
                metadata = {
                    name: (parsed as { name: string }).name,
                    selections: parseGeofileSelections(
                        (parsed as { selections?: unknown }).selections,
                    ),
                };
            } catch {
                failed();
            }
        });
        parser.once('partsLimit', failed);
        parser.once('filesLimit', failed);
        parser.once('fieldsLimit', failed);
        parser.on('error', failed);
        parser.once('close', () => {
            if (settled) return;
            if (!metadata || fileCount !== 1 || fieldCount !== 1 || !ended || !size) {
                failed();
                return;
            }
            settled = true;
            cleanup();
            resolve({ ...metadata, data: Buffer.concat(chunks, size) });
        });
        request.pipe(parser);
        if (request.aborted) failed();
    });
}

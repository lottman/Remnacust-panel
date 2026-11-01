import type { AxiosResponse } from 'axios';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';

import { isAxiosError } from 'axios';
import { pipeline } from 'node:stream/promises';

import { Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';

import { AxiosService } from '@common/axios/axios.service';

@Controller('geofiles')
export class GeofilesController {
    constructor(private readonly axios: AxiosService) {}

    @Get(':id/bundles/:selection/:filename')
    async bundleDownload(
        @Param('id') id: string,
        @Param('filename') filename: string,
        @Param('selection') selection: string,
        @Req() request: Request,
        @Res() response: Response,
    ) {
        if (!filename.startsWith('bundle-')) throw new NotFoundException();
        return this.download(id, filename, selection, request, response);
    }

    @Get(':id/:filename')
    async download(
        @Param('id') id: string,
        @Param('filename') filename: string,
        @Query('selection') selection: unknown,
        @Req() request: Request,
        @Res() response: Response,
    ) {
        if (
            !/^[0-9a-f]{34}$/.test(id) ||
            !/^(?:[0-9a-f]{64}\.(?:dat|srs|json|yaml|txt)|latest\.(?:dat|srs|json|yaml|txt)|rules-[A-Za-z0-9_-]{1,2732}\.[a-f0-9]{64}\.(?:json|yaml)|bundle-[a-f0-9]{64}\.dat(?:\.sha256)?)$/.test(
                filename,
            )
        )
            throw new NotFoundException();
        if (
            filename.startsWith('bundle-') &&
            (typeof selection !== 'string' || !/^[A-Za-z0-9_-]{1,2732}$/.test(selection))
        )
            throw new NotFoundException();
        const abort = new AbortController();
        const disconnected = () => {
            if (!response.writableFinished) abort.abort();
        };
        response.once('close', disconnected);
        let upstream: AxiosResponse<Readable> | undefined;
        try {
            // Fixed trusted upstream; neither target URL nor headers come from the client.
            upstream = await this.axios.axiosInstance.get<Readable>(
                `/api/sub/geofiles/${id}/${filename}`,
                {
                    responseType: 'stream',
                    // Axios also enforces maxContentLength on streams. The
                    // subscription JSON cap is smaller than a valid DAT bundle.
                    maxContentLength: 64 * 1024 * 1024,
                    params: filename.startsWith('bundle-') ? { selection } : undefined,
                    maxRedirects: 0,
                    signal: abort.signal,
                    timeout: 30_000,
                    headers: { 'Accept-Encoding': 'identity' },
                    decompress: false,
                    validateStatus: (status) => status === 200,
                },
            );
            const size = Number(upstream.headers['content-length']);
            if (!Number.isSafeInteger(size) || size < 1 || size > 64 * 1024 * 1024) {
                upstream.data.destroy();
                throw new NotFoundException();
            }
            response.set({
                'Content-Type': filename.endsWith('.sha256')
                    ? 'text/plain; charset=utf-8'
                    : 'application/octet-stream',
                'Content-Length': String(size),
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': /^[a-f0-9]{64}\./.test(filename)
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=0, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "default-src 'none'; sandbox",
            });
            await pipeline(upstream.data, response, { signal: abort.signal });
        } catch (error) {
            abort.abort();
            upstream?.data.destroy();
            upstream?.request?.destroy?.();
            if (isAxiosError(error)) {
                error.response?.data?.destroy?.();
                error.request?.destroy?.();
            }
            const transient =
                isAxiosError(error) &&
                ((error.response?.status ?? 0) >= 500 ||
                    error.response?.status === 429 ||
                    [
                        'ECONNABORTED',
                        'ETIMEDOUT',
                        'ECONNRESET',
                        'ECONNREFUSED',
                        'EHOSTUNREACH',
                        'ENETUNREACH',
                        'ENOTFOUND',
                        'EAI_AGAIN',
                    ].includes(error.code ?? ''));
            if (!response.headersSent && !response.destroyed) {
                response.set('Cache-Control', 'no-store');
                if (transient) response.set('Retry-After', '2');
                response.status(transient ? 503 : 404).end();
            } else if (!response.writableFinished) response.destroy();
        } finally {
            response.off('close', disconnected);
        }
    }
}

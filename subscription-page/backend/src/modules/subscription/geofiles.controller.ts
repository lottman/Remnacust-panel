import type { Request, Response } from 'express';

import { pipeline } from 'node:stream/promises';

import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';

import { AxiosService } from '@common/axios/axios.service';

@Controller('geofiles')
export class GeofilesController {
    constructor(private readonly axios: AxiosService) {}

    @Get(':id/:filename')
    async download(
        @Param('id') id: string,
        @Param('filename') filename: string,
        @Req() request: Request,
        @Res() response: Response,
    ) {
        if (
            !/^[0-9a-f]{34}$/.test(id) ||
            !/^(?:[0-9a-f]{64}\.(?:dat|srs|json|yaml|txt)|latest\.(?:dat|srs|json|yaml|txt)|rules-[A-Za-z0-9_-]{1,2732}\.[a-f0-9]{64}\.(?:json|yaml))$/.test(
                filename,
            )
        )
            throw new NotFoundException();
        const abort = new AbortController();
        const disconnected = () => {
            if (!response.writableFinished) abort.abort();
        };
        response.once('close', disconnected);
        try {
            // Fixed trusted upstream; neither target URL nor headers come from the client.
            const upstream = await this.axios.axiosInstance.get(
                `/api/sub/geofiles/${id}/${filename}`,
                {
                    responseType: 'stream',
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
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(size),
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': /^[a-f0-9]{64}\./.test(filename)
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=0, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "default-src 'none'; sandbox",
            });
            await pipeline(upstream.data, response, { signal: abort.signal });
        } catch {
            if (!response.headersSent && !response.destroyed) response.status(404).end();
            else if (!response.writableFinished) response.destroy();
        } finally {
            response.off('close', disconnected);
        }
    }
}

import type { Request, Response } from 'express';

import { createHash } from 'node:crypto';

import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Res,
    StreamableFile,
    UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AdminOnlyEndpoint } from '@common/decorators/admin-only-endpoint';
import { Roles } from '@common/decorators/roles/roles';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles';
import { ROLE } from '@libs/contracts/constants';

import { MAX_GEOFILE_BYTES } from './download-geofile';
import { GeofilesService } from './geofiles.service';

@ApiExcludeController()
@Controller('geofiles')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
export class GeofilesController {
    constructor(private readonly files: GeofilesService) {}

    @AdminOnlyEndpoint()
    @Get()
    async list() {
        return { response: await this.files.list() };
    }

    @AdminOnlyEndpoint()
    @Post('upload')
    async upload(
        @Req() request: Request,
        @Query('name') name: string,
        @Query('kind') kind: string,
    ) {
        return {
            response: await this.files.ingest(name, kind, async () => {
                const chunks: Buffer[] = [];
                let size = 0;
                const timer = setTimeout(
                    () => request.destroy(new Error('geofile-timeout')),
                    30_000,
                );
                try {
                    if (Number(request.headers['content-length'] ?? 0) > MAX_GEOFILE_BYTES)
                        throw new Error('geofile-size');
                    for await (const part of request) {
                        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
                        size += chunk.length;
                        if (size > MAX_GEOFILE_BYTES) throw new Error('geofile-size');
                        chunks.push(chunk);
                    }
                    return Buffer.concat(chunks, size);
                } finally {
                    clearTimeout(timer);
                }
            }),
        };
    }

    @AdminOnlyEndpoint()
    @Post('import')
    async importUrl(@Body() body: { name?: unknown; kind?: unknown; url?: unknown }) {
        return { response: await this.files.importUrl(body?.name, body?.kind, body?.url) };
    }

    @AdminOnlyEndpoint()
    @Patch(':id/refresh')
    async configureRefresh(
        @Param('id') id: string,
        @Body() body: { sourceUrl?: unknown; enabled?: unknown; intervalSeconds?: unknown },
    ) {
        return { response: await this.files.configureRefresh(id, body ?? {}) };
    }

    @AdminOnlyEndpoint()
    @Post(':id/refresh')
    async refresh(@Param('id') id: string) {
        return { response: { updated: await this.files.refreshNow(id) } };
    }

    @AdminOnlyEndpoint()
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.files.remove(id);
        return { response: true };
    }
}

@ApiExcludeController()
@Controller('sub/geofiles')
export class PublicGeofilesController {
    constructor(private readonly files: GeofilesService) {}

    @Get(':id/:filename')
    async download(
        @Param('id') id: string,
        @Param('filename') filename: string,
        @Res({ passthrough: true }) response: Response,
    ) {
        const mutable = filename.startsWith('latest.') || filename.startsWith('rules-');
        const derived = filename.startsWith('rules-')
            ? await this.files.derived(id, filename)
            : undefined;
        if (derived) {
            response.set({
                'Cache-Control': 'public, max-age=0, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
                'Content-Security-Policy': "default-src 'none'; sandbox",
                'Cross-Origin-Resource-Policy': 'cross-origin',
                ETag: `"${createHash('sha256').update(derived).digest('hex')}"`,
            });
            return new StreamableFile(derived, {
                type: 'application/octet-stream',
                length: derived.length,
                disposition:
                    'attachment; filename="ruleset.' +
                    (filename.endsWith('.json') ? 'json' : 'yaml') +
                    '"',
            });
        }
        const { item, stream } = await this.files.download(id, filename);
        response.set({
            'Cache-Control': mutable
                ? 'public, max-age=0, must-revalidate'
                : 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Cross-Origin-Resource-Policy': 'cross-origin',
            ETag: `"${item.sha256}"`,
        });
        return new StreamableFile(stream, {
            type: 'application/octet-stream',
            length: item.size,
            disposition: `attachment; filename="${item.filename}"`,
        });
    }
}

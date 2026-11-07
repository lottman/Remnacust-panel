import type { GeofileEdit } from './geofile-editor';
import type { Request, Response } from 'express';

import { createHash } from 'node:crypto';

import {
    Body,
    BadRequestException,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Patch,
    Post,
    Put,
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
import { parseGeofileSelections } from './geofile-editor';
import { readGeofileMultipart } from './geofile-multipart';
import { GeofilesService } from './geofiles.service';

@ApiExcludeController()
@Controller('geofiles')
@Roles(ROLE.ADMIN)
@UseGuards(JwtDefaultGuard, RolesGuard)
export class GeofilesController {
    constructor(private readonly files: GeofilesService) {}

    @AdminOnlyEndpoint()
    @Get()
    async list(@Res({ passthrough: true }) response: Response) {
        response.set('Cache-Control', 'no-store');
        return { response: await this.files.list() };
    }

    private async readData(request: Request): Promise<Buffer> {
        if (
            request.headers['content-type']?.split(';')[0].trim().toLowerCase() !==
            'application/octet-stream'
        )
            throw Error('geofile-raw-content-type');
        const chunks: Buffer[] = [];
        let size = 0;
        const timer = setTimeout(() => request.destroy(new Error('geofile-timeout')), 30_000);
        try {
            if (Number(request.headers['content-length'] ?? 0) > MAX_GEOFILE_BYTES)
                throw Error('geofile-size');
            for await (const part of request) {
                const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
                size += chunk.length;
                if (size > MAX_GEOFILE_BYTES) throw Error('geofile-size');
                chunks.push(chunk);
            }
            return Buffer.concat(chunks, size);
        } finally {
            clearTimeout(timer);
        }
    }

    @AdminOnlyEndpoint()
    @Get(':id/content')
    async content(
        @Param('id') id: string,
        @Query() query: { category?: string; page?: string; limit?: string; search?: string },
        @Res({ passthrough: true }) response: Response,
    ) {
        response.set('Cache-Control', 'no-store');
        return { response: await this.files.content(id, query) };
    }

    @AdminOnlyEndpoint()
    @Post(':id/copy')
    async copy(@Param('id') id: string, @Body() body: GeofileEdit) {
        return { response: await this.files.editContent(id, body, true) };
    }

    @AdminOnlyEndpoint()
    @Patch(':id/content')
    async edit(@Param('id') id: string, @Body() body: GeofileEdit) {
        return { response: await this.files.editContent(id, body) };
    }

    private replacementSha(request: Request, sha?: string) {
        const header = request.headers['if-match'];
        if (typeof header === 'string') return header.replace(/^"([a-f0-9]{64})"$/, '$1');
        return sha;
    }

    @AdminOnlyEndpoint()
    @Put(':id/data')
    async replace(@Param('id') id: string, @Req() request: Request, @Query('sha256') sha: string) {
        return {
            response: await this.files.replaceData(id, this.replacementSha(request, sha), () =>
                this.readData(request),
            ),
        };
    }

    @AdminOnlyEndpoint()
    @Post(':id/copy-data')
    async copyData(
        @Param('id') id: string,
        @Req() request: Request,
        @Query('name') name: string,
        @Query('sha256') sha: string,
        @Query('selections') selected: string,
    ) {
        if (/^multipart\/form-data\s*;/i.test(request.headers['content-type'] ?? '')) {
            return {
                response: await this.files.copyData(id, this.replacementSha(request, sha), () =>
                    readGeofileMultipart(request),
                ),
            };
        }
        let selections;
        try {
            selections = parseGeofileSelections(selected, true);
        } catch {
            throw new BadRequestException('geofile-copy-selections');
        }
        return {
            response: await this.files.replaceData(
                id,
                this.replacementSha(request, sha),
                () => this.readData(request),
                name ?? '',
                selections,
            ),
        };
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

    @Get(':id/bundles/:selection/:filename')
    async bundleDownload(
        @Param('id') id: string,
        @Param('filename') filename: string,
        @Param('selection') selection: string,
        @Res({ passthrough: true }) response: Response,
    ) {
        if (!filename.startsWith('bundle-')) throw new NotFoundException('Geofile not found');
        return this.download(id, filename, selection, response);
    }

    @Get(':id/:filename')
    async download(
        @Param('id') id: string,
        @Param('filename') filename: string,
        @Query('selection') selection: unknown,
        @Res({ passthrough: true }) response: Response,
    ) {
        const mutable =
            filename.startsWith('latest.') ||
            filename.startsWith('rules-') ||
            filename.startsWith('bundle-');
        const derived = filename.startsWith('bundle-')
            ? await this.files.bundle(id, filename, selection)
            : filename.startsWith('rules-')
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
                type: filename.endsWith('.sha256') ? 'text/plain' : 'application/octet-stream',
                length: derived.length,
                disposition:
                    'attachment; filename="ruleset.' +
                    (filename.endsWith('.sha256')
                        ? 'dat.sha256'
                        : filename.endsWith('.dat')
                          ? 'dat'
                          : filename.endsWith('.json')
                            ? 'json'
                            : 'yaml') +
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

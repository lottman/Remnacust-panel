import { RequestHandler } from 'express';
import sirv from 'sirv';
import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { getAssetsPath } from '../utils/get-assets-path';

const HASHED = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i;

export function frontendAssets(rootPath: string): RequestHandler {
    const serve = sirv(rootPath, {
        single: true,
        etag: true,
        gzip: true,
        brotli: true,
        setHeaders(res, pathname) {
            res.setHeader('Cache-Control', HASHED.test(pathname.replace(/\.(?:gz|br)$/, ''))
                ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
    });
    return (req, res, next) => {
        let pathname: string;
        try { pathname = decodeURIComponent((req.originalUrl ?? req.url).split('?')[0]); }
        catch { return next(); }
        if (/^\/api(?:\/|$)/i.test(pathname) || !['GET', 'HEAD'].includes(req.method)) return next();
        serve(req, res, next);
    };
}

@Module({})
export class FrontendModule implements OnModuleInit {
    constructor(private readonly adapter: HttpAdapterHost) {}

    onModuleInit(): void {
        this.adapter.httpAdapter.use(frontendAssets(getAssetsPath()));
    }
}

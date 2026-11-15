import type { NextFunction, Request, Response } from 'express';

export function geofileRootAlias(customPrefix = '') {
    const prefix = customPrefix.replace(/^\/+|\/+$/g, '');
    return (req: Request, _res: Response, next: NextFunction) => {
        if (
            prefix &&
            (req.method === 'GET' || req.method === 'HEAD') &&
            /^\/geofiles\/[a-f0-9]{34}\/(?:bundles\/[A-Za-z0-9_-]{1,2732}\/)?[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(
                req.url.split('?', 1)[0],
            )
        )
            req.url = '/' + prefix + req.url;
        next();
    };
}

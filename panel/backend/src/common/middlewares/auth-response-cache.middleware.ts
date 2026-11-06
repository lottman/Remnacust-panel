import type { RequestHandler } from 'express';

export const authResponseCache: RequestHandler = (request, response, next) => {
    const path = request.path.toLowerCase();
    if (/^\/api\/sub\/[^/]+\/info\/?$/.test(path)) {
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Pragma', 'no-cache');
        return next();
    }
    if (request.headers.authorization || path === '/api/auth' || path.startsWith('/api/auth/')) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Pragma', 'no-cache');
    }
    next();
};

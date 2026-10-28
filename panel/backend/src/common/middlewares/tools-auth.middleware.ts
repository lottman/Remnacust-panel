import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { getQuery } from 'ufo';

import { Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { HttpExceptionWithErrorCodeType } from '@common/exception/http-exeception-with-error-code.type';
import type { RawCacheService } from '@common/raw-cache';
import type { TResult } from '@common/types';
import { isAdminSessionCurrent } from '@common/utils/admin-session';
import { isDevelopment } from '@common/utils/startup-app';
import { BACKEND_TOOLS_ROOT, ROOT } from '@libs/contracts/api';
import {
    BACKEND_TOOLS_AUTH_COOKIE_NAME,
    BACKEND_TOOLS_JWT_ISSUER,
    BACKEND_TOOLS_JWT_LIFETIME_HOURS,
    BACKEND_TOOLS_JWT_SCOPES,
    ERRORS,
    ROLE,
    TBackendToolsJwtScope,
} from '@libs/contracts/constants';

import type { AdminEntity } from '@modules/admin/entities/admin.entity';
import { GetAdminByUsernameQuery } from '@modules/admin/queries/get-admin-by-username';
import type { IJWTAuthPayload } from '@modules/auth/interfaces';

const logger = new Logger('ToolsAuth');

type ToolsPayload = jwt.JwtPayload & { parent?: IJWTAuthPayload };

export function toolsAuthMiddleware(
    appSecret: string,
    cache: RawCacheService,
    queryBus: QueryBus,
    frontEndOrigin: string,
    panelDomain?: string,
) {
    let allowedOrigin: string | null = null;
    try {
        const configured = frontEndOrigin !== '*' ? frontEndOrigin : panelDomain;
        if (configured) {
            const url = new URL(configured.includes('://') ? configured : `https://${configured}`);
            if (
                !url.username &&
                !url.password &&
                (url.protocol === 'https:' || (isDevelopment() && url.protocol === 'http:'))
            ) {
                allowedOrigin = url.origin;
            }
        }
    } catch {
        // No trusted origin configured: cookie-authenticated writes stay disabled.
    }
    const parentIsCurrent = async (payload: ToolsPayload | null): Promise<boolean> => {
        const parent = payload?.parent;
        if (!parent || parent.role !== ROLE.ADMIN || !parent.username) return false;
        const admin = await queryBus.execute<GetAdminByUsernameQuery, TResult<AdminEntity>>(
            new GetAdminByUsernameQuery(parent.username, ROLE.ADMIN),
        );
        return (
            admin.isOk &&
            isAdminSessionCurrent(parent, admin.response, appSecret, (key) => cache.exists(key))
        );
    };
    return async (req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');

        if (
            !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
            (!allowedOrigin || req.headers.origin !== allowedOrigin)
        ) {
            res.sendStatus(403);
            return;
        }

        const { ott } = getQuery(req.originalUrl);

        if (typeof ott === 'string' && ott.length > 0) {
            const payload = verifyJwt(ott, appSecret, 'ott');
            if (payload) {
                // Shared across API workers: a signed one-time token can be redeemed once.
                const digest = createHash('sha256').update(ott).digest('hex');
                try {
                    if (!(await parentIsCurrent(payload))) {
                        res.sendStatus(403);
                        return;
                    }
                    if ((await cache.incrementWithTtl(`tools:ott:used:${digest}`, 60)) !== 1) {
                        res.sendStatus(403);
                        return;
                    }
                } catch {
                    res.sendStatus(503);
                    return;
                }
                const signed = signJwt(appSecret, payload.parent!);
                if (!signed) {
                    res.sendStatus(403);
                    return;
                }

                res.cookie(BACKEND_TOOLS_AUTH_COOKIE_NAME, signed.token, {
                    httpOnly: true,
                    secure: !isDevelopment(),
                    sameSite: 'lax',
                    path: `${ROOT}${BACKEND_TOOLS_ROOT}`,
                    maxAge: signed.maxAge,
                });

                logger.warn(
                    `Tools access granted. Path: ${req.path}. IP: ${'clientIp' in req ? req.clientIp : 'unknown'}`,
                );

                const redirectUrl = new URL(req.originalUrl, 'http://localhost');
                redirectUrl.searchParams.delete('ott');
                res.redirect(redirectUrl.pathname + redirectUrl.search);

                return;
            } else {
                throw new HttpExceptionWithErrorCodeType(
                    ERRORS.FORBIDDEN.message,
                    ERRORS.FORBIDDEN.code,
                    ERRORS.FORBIDDEN.httpCode,
                );
            }
        }

        let valid = false;
        try {
            const token = getCookie(req, BACKEND_TOOLS_AUTH_COOKIE_NAME);
            valid = await parentIsCurrent(
                token ? verifyJwt(token, appSecret, BACKEND_TOOLS_JWT_SCOPES.ACCESS) : null,
            );
        } catch {
            res.sendStatus(503);
            return;
        }
        if (!valid) {
            throw new HttpExceptionWithErrorCodeType(
                ERRORS.FORBIDDEN.message,
                ERRORS.FORBIDDEN.code,
                ERRORS.FORBIDDEN.httpCode,
            );
        }

        return next();
    };
}

function getCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;

    if (!header) {
        return null;
    }

    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');

        if (key === name) {
            try {
                return decodeURIComponent(rest.join('='));
            } catch {
                return null;
            }
        }
    }

    return null;
}

function signJwt(appSecret: string, parent: IJWTAuthPayload) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = Math.min(parent.exp ?? 0, issuedAt + BACKEND_TOOLS_JWT_LIFETIME_HOURS * 3600);
    if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt) return null;
    // Absolute claims avoid a second clock read inside the signer extending the parent lifetime.
    return {
        token: jwt.sign(
            { scope: BACKEND_TOOLS_JWT_SCOPES.ACCESS, parent, iat: issuedAt, exp: expiresAt },
            appSecret,
            {
                issuer: BACKEND_TOOLS_JWT_ISSUER,
            },
        ),
        maxAge: (expiresAt - issuedAt) * 1000,
    };
}

function verifyJwt(
    token: string,
    appSecret: string,
    scope: TBackendToolsJwtScope,
): ToolsPayload | null {
    try {
        const decoded = jwt.verify(token, appSecret, {
            algorithms: ['HS256'],
            issuer: BACKEND_TOOLS_JWT_ISSUER,
            ignoreExpiration: false,
        });

        return typeof decoded === 'object' && decoded.scope === scope
            ? (decoded as ToolsPayload)
            : null;
    } catch {
        return null;
    }
}

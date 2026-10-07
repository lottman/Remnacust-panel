import { json, RequestHandler } from 'express';
import { verify } from 'jsonwebtoken';

import { ROLE } from '@libs/contracts/constants';

export function boundedJsonParser(secret: string): RequestHandler {
    const publicParser = json({ limit: '1mb' });
    const authenticatedParser = json({ limit: '100mb' });
    return (request, response, next) => {
        let signed = false;
        const authorization = request.headers.authorization;
        if (authorization?.startsWith('Bearer ')) {
            try {
                const payload = verify(authorization.slice(7), secret, { algorithms: ['HS256'] });
                signed =
                    typeof payload === 'object' &&
                    typeof payload.uuid === 'string' &&
                    (payload.role === ROLE.ADMIN || payload.role === ROLE.API);
            } catch {
                // Invalid credentials never unlock the large administrative payload budget.
            }
        }
        // This only chooses the parsing budget. All database-backed auth/scope guards still run.
        return (signed ? authenticatedParser : publicParser)(request, response, next);
    };
}

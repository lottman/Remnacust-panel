import type { Response } from 'express';

import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const compress = promisify(gzip);

export async function sendSubscriptionBody(
    response: Response,
    body: string,
    contentType: string,
): Promise<Response> {
    response.type(contentType).vary('Accept-Encoding');
    if (
        body.length >= 4096 &&
        response.req.headers['accept-encoding'] &&
        response.req.acceptsEncodings('gzip') &&
        !response.getHeader('Content-Encoding')
    ) {
        const encoded = await compress(body, { level: 6 });
        response.set('Content-Encoding', 'gzip');
        return response.send(encoded);
    }
    return response.send(body);
}

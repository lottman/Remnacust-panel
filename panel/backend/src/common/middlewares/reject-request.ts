import type { Request, Response } from 'express';

import type { HttpException } from '@nestjs/common';

export function hasRequestBody(request: Request): boolean {
    return (
        request.headers['transfer-encoding'] !== undefined ||
        Number(request.headers['content-length']) > 0
    );
}

export function rejectRequest(
    request: Request,
    response: Response,
    exception: HttpException,
): void {
    if (
        request.headers['transfer-encoding'] !== undefined ||
        Number(request.headers['content-length']) > 64 * 1024
    ) {
        response.setHeader('Connection', 'close');
    }
    const status = exception.getStatus();
    const value = exception.getResponse();
    response
        .status(status)
        .json(typeof value === 'string' ? { statusCode: status, message: value } : value);
}

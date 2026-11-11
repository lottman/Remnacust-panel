import { InternalServerErrorException } from '@nestjs/common';

import { ERRORS } from '@libs/contracts/constants/errors';

import { HttpExceptionWithErrorCodeType } from '../exception/http-exeception-with-error-code.type';
import { TResult } from '../types/result.type';

const ERROR_CATALOG = Object.values(ERRORS);

export function errorHandler<T>(response: TResult<T>): T {
    if (response.isOk) {
        return response.response;
    } else {
        if (!response.code) {
            throw new InternalServerErrorException('Unknown error');
        }
        const candidates = ERROR_CATALOG.filter((error) => error.code === response.code);
        const errorObject =
            candidates.find(
                (error) =>
                    error.message === response.message &&
                    (response.httpCode === undefined || error.httpCode === response.httpCode),
            ) ??
            candidates.find((error) => error.httpCode === response.httpCode) ??
            (response.httpCode === undefined ? candidates.at(-1) : undefined);

        if (!errorObject) {
            throw new InternalServerErrorException('Unknown error');
        }
        throw new HttpExceptionWithErrorCodeType(
            response.message || errorObject.message,
            errorObject.code,
            errorObject.httpCode,
        );
    }
}

import {
    applyDecorators,
    Patch,
    Delete,
    Put,
    All,
    Post,
    Get,
    HttpCode,
    Type,
    HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { ApiScopeEndpoint } from '@common/decorators/scopes';
import { EndpointDetails } from '@libs/contracts/constants';

interface EndpointWithBodyOptions {
    command: { endpointDetails: EndpointDetails };
    httpCode: HttpStatus.CREATED | HttpStatus.OK;
    type: string | Function | Type<unknown> | [Function];
}

interface EndpointWithoutBodyOptions {
    command: { endpointDetails: EndpointDetails };
    httpCode: HttpStatus.ACCEPTED | HttpStatus.NO_CONTENT;
    type?: never;
}

type ApiEndpointOptions = EndpointWithBodyOptions | EndpointWithoutBodyOptions;

export function Endpoint(options: ApiEndpointOptions) {
    const method = options.command.endpointDetails.REQUEST_METHOD.toLowerCase();

    return applyDecorators(
        resolveRequestMethod(method)(options.command.endpointDetails.CONTROLLER_URL),
        ApiScopeEndpoint(options.command.endpointDetails),
        HttpCode(options.httpCode),
        ApiOperation({
            summary: options.command.endpointDetails.METHOD_DESCRIPTION,
            description: options.command.endpointDetails.METHOD_LONG_DESCRIPTION,
        }),
        ApiResponse({
            status: options.httpCode,
            description: resolveResponseDescription(options.httpCode),
            type: options.type,
        }),
    );
}

function resolveRequestMethod(method: string) {
    switch (method) {
        case 'get':
            return Get;
        case 'post':
            return Post;
        case 'put':
            return Put;
        case 'delete':
            return Delete;
        case 'patch':
            return Patch;
        default:
            return All;
    }
}

function resolveResponseDescription(httpCode: number) {
    switch (httpCode) {
        case HttpStatus.OK:
            return 'Operation successful';
        case HttpStatus.CREATED:
            return 'Resource created successfully';
        case HttpStatus.NO_CONTENT:
            return 'Operation successful, no content returned';
        case HttpStatus.ACCEPTED:
            return 'Operation accepted and will be processed in background';
        case HttpStatus.CONFLICT:
            return 'Conflict, resource already exists';
        default:
            return 'Operation successful';
    }
}

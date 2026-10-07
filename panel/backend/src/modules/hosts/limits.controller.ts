import { z } from 'zod';

import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles/roles';
import { ApiScopeEndpoint, ApiScopeResource } from '@common/decorators/scopes';
import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RolesGuard } from '@common/guards/roles/roles.guard';
import { ScopesGuard } from '@common/guards/scopes';
import { CONTROLLERS_INFO } from '@libs/contracts/api';
import { getEndpointDetails, ROLE } from '@libs/contracts/constants';

import { limitSelectionSchema } from './limit-selection';
import { LimitsService } from './limits.service';

const scope = z.object({ kind: z.enum(['HOST', 'TAG']), key: z.string().min(1).max(100) });
const validScope = (v: { kind: string; key: string }) =>
    v.kind !== 'HOST' || z.uuid().safeParse(v.key).success;
export const limitActionSchema = scope
    .extend({
        selection: limitSelectionSchema,
        action: z.enum(['ADD', 'RESET', 'PAUSE', 'RESUME']),
        amountBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
        requestId: z.uuid(),
    })
    .strict()
    .refine(validScope)
    .refine((v) => (v.action === 'ADD' ? v.amountBytes > 0 : v.amountBytes === 0));
export const limitSelectionStateSchema = scope
    .extend({ selection: limitSelectionSchema })
    .strict()
    .refine(validScope);

export const unlimitedLimitSchema = scope
    .extend({
        selection: limitSelectionSchema,
        enabled: z.boolean(),
        requestId: z.uuid(),
    })
    .strict()
    .refine(validScope);
export const listUsersSchema = scope
    .extend({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        search: z.string().trim().max(100).default(''),
        pageSize: z.coerce
            .number()
            .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
            .default(50),
        status: z.enum(['ALL', 'ACTIVE', 'DISABLED', 'LIMITED', 'EXPIRED']).default('ALL'),
        state: z.enum(['ALL', 'PAUSED', 'EXHAUSTED', 'AVAILABLE', 'UNAVAILABLE']).default('ALL'),
        sort: z
            .enum([
                'username',
                'id',
                'expireAt',
                'usedBytes',
                'limitBytes',
                'remainingBytes',
                'bonusBytes',
            ])
            .default('usedBytes'),
        direction: z.enum(['asc', 'desc']).default('desc'),
        squadType: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
        squadUuid: z.uuid().optional(),
    })
    .strict()
    .refine(validScope)
    .refine((v) => Boolean(v.squadType) === Boolean(v.squadUuid));
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Некорректные параметры лимитов');
    return parsed.data;
}

@ApiBearerAuth('Authorization')
@ApiTags(CONTROLLERS_INFO.LIMITS.tag)
@ApiScopeResource(CONTROLLERS_INFO.LIMITS.resource)
@Roles(ROLE.ADMIN, ROLE.API)
@UseGuards(JwtDefaultGuard, RolesGuard, ScopesGuard)
@Controller('limits')
export class LimitsController {
    constructor(private readonly service: LimitsService) {}
    @Get()
    @ApiScopeEndpoint(
        getEndpointDetails('', 'get', 'List host and tag limit scopes', {
            scope: 'list',
            kind: 'read',
        }),
    )
    @Header('Cache-Control', 'no-store')
    async list() {
        return { response: await this.service.list() };
    }
    @Get('targets')
    @ApiScopeEndpoint(
        getEndpointDetails('targets', 'get', 'List squads for limit actions', {
            scope: 'targets',
            kind: 'read',
        }),
    )
    @Header('Cache-Control', 'no-store')
    async targets() {
        return { response: await this.service.targets() };
    }
    @Get('users')
    @ApiScopeEndpoint(
        getEndpointDetails('users', 'get', 'List users and usage in a limit scope', {
            scope: 'users',
            kind: 'read',
        }),
    )
    @Header('Cache-Control', 'no-store')
    async users(@Query() query: unknown) {
        const q = parse(listUsersSchema, query);
        return {
            response: await this.service.users(
                q.kind,
                q.key,
                q.page,
                q.search,
                q.squadType && q.squadUuid
                    ? {
                          type: 'SQUAD',
                          squadType: q.squadType,
                          squadUuid: q.squadUuid.toLowerCase(),
                      }
                    : { type: 'ALL' },
                {
                    pageSize: q.pageSize,
                    status: q.status,
                    state: q.state,
                    sort: q.sort,
                    direction: q.direction,
                },
            ),
        };
    }
    @Post('selection-state')
    @ApiScopeEndpoint(
        getEndpointDetails('selection-state', 'post', 'Inspect recipients and pause state', {
            scope: 'selection-state',
            kind: 'read',
        }),
    )
    @Header('Cache-Control', 'no-store')
    async selectionState(@Body() body: unknown) {
        const q = parse(limitSelectionStateSchema, body);
        return { response: await this.service.selectionState(q.kind, q.key, q.selection) };
    }
    @Post('actions')
    @ApiScopeEndpoint(
        getEndpointDetails('actions', 'post', 'Grant, reset, pause or resume traffic', {
            scope: 'actions',
            kind: 'write',
        }),
    )
    async action(@Body() body: unknown) {
        return { response: await this.service.act(parse(limitActionSchema, body)) };
    }

    @Post('unlimited')
    @ApiBody({
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'key', 'enabled', 'requestId', 'selection'],
            properties: {
                kind: { type: 'string', enum: ['HOST', 'TAG'] },
                key: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 100,
                    description: 'Host UUID or tag name',
                },
                enabled: {
                    type: 'boolean',
                    description: 'Grant when true, revoke when false; persists until revoked',
                },
                requestId: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Idempotency key; use a new UUID for a different operation',
                },
                selection: {
                    oneOf: [
                        {
                            type: 'object',
                            additionalProperties: false,
                            required: ['type'],
                            properties: { type: { type: 'string', enum: ['ALL'] } },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            required: ['type', 'userIds'],
                            properties: {
                                type: { type: 'string', enum: ['SELECTED'] },
                                userIds: {
                                    type: 'array',
                                    minItems: 1,
                                    maxItems: 500,
                                    items: { type: 'string', pattern: '^[1-9][0-9]{0,18}$' },
                                },
                            },
                        },
                        {
                            type: 'object',
                            additionalProperties: false,
                            required: ['type', 'squadType', 'squadUuid'],
                            properties: {
                                type: { type: 'string', enum: ['SQUAD'] },
                                squadType: { type: 'string', enum: ['INTERNAL', 'EXTERNAL'] },
                                squadUuid: { type: 'string', format: 'uuid' },
                            },
                        },
                    ],
                },
            },
        },
        examples: {
            singleUser: {
                value: {
                    kind: 'TAG',
                    key: 'DE',
                    enabled: true,
                    requestId: '44444444-4444-4444-8444-444444444444',
                    selection: { type: 'SELECTED', userIds: ['42'] },
                },
            },
        },
    })
    @ApiScopeEndpoint(
        getEndpointDetails('unlimited', 'post', 'Grant or revoke personal unlimited quota', {
            scope: 'unlimited',
            kind: 'write',
        }),
    )
    async unlimited(@Body() body: unknown) {
        const { enabled, ...input } = parse(unlimitedLimitSchema, body);
        return {
            response: await this.service.act({
                ...input,
                action: enabled ? 'UNLIMITED' : 'LIMITED',
                amountBytes: 0,
            }),
        };
    }
}

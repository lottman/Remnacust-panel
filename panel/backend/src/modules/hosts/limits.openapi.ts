import { z } from 'zod';

import type { OpenAPIObject, SchemaObject } from '@nestjs/swagger';

import {
    limitActionSchema,
    listUsersSchema,
    limitSelectionStateSchema,
    unlimitedLimitSchema,
} from './limits.controller';

// These endpoints use explicit Zod validation rather than DTO parameters.
// Publish their input contracts from those validators, not a second validation model.
export function documentLimits(document: OpenAPIObject): void {
    const input = (schema: z.ZodType) => {
        const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
        delete json.$schema;
        return json as SchemaObject;
    };
    const bodies = {
        '/api/limits/actions': limitActionSchema,
        '/api/limits/selection-state': limitSelectionStateSchema,
        '/api/limits/unlimited': unlimitedLimitSchema,
    };
    for (const [path, schema] of Object.entries(bodies)) {
        const operation = document.paths[path]?.post;
        if (!operation) continue;
        operation.requestBody = {
            required: true,
            content: { 'application/json': { schema: input(schema) } },
        };
        const selectionNote =
            'HOST key must be a host UUID; TAG key is a tag name. SELECTED accepts 1–500 user IDs as positive signed-64-bit decimal strings; duplicate IDs are normalized. Every selected user must be entitled to the scope. ALL and SQUAD target current entitled recipients, independently of search and pagination.';
        operation.description = path.endsWith('/actions')
            ? `${selectionNote} requestId is a UUID: replay an identical request with the same ID. Reusing an ID with a different body returns 409. ADD requires a positive amountBytes and a positive base quota; other actions require amountBytes = 0.`
            : path.endsWith('/unlimited')
              ? `${selectionNote} Set enabled=true or false for the selected scope. A personal unlimited exemption persists until revoked and does not override other access restrictions. requestId identifies an idempotent request; a different body with the same ID returns 409.`
              : `${selectionNote} This endpoint reads state for the specified selection without changing quotas.`;
        const selection = (
            operation.requestBody as { content: Record<string, { schema: SchemaObject }> }
        ).content['application/json'].schema.properties?.selection as SchemaObject | undefined;
        const selected = selection?.oneOf?.[1] as SchemaObject | undefined;
        const userIds = selected?.properties?.userIds as SchemaObject | undefined;
        if (userIds)
            userIds.items = {
                type: 'string',
                pattern: '^[1-9][0-9]{0,18}$',
                description: 'Positive signed-64-bit ID; at most 9223372036854775807',
            };
    }
    const users = document.paths['/api/limits/users']?.get;
    const query = input(listUsersSchema);
    query.properties!.pageSize = { type: 'integer', enum: [25, 50, 100], default: 50 };
    if (users)
        users.description =
            'kind=HOST requires a host UUID; kind=TAG requires a tag name. squadType and squadUuid must be provided together. Byte counters are decimal strings. limitBytes=0 denotes unlimited quota; paused and accessNow are independent state flags.';
    if (users)
        users.parameters = Object.entries(query.properties ?? {}).map(([name, schema]) => ({
            name,
            in: 'query',
            required: query.required?.includes(name) ?? false,
            schema,
        }));
    const scope = z.object({
        kind: z.enum(['HOST', 'TAG']),
        key: z.string(),
        name: z.string(),
        limitBytes: z.string(),
        usedBytes: z.string(),
        viewPosition: z.number(),
        speedLimitMbps: z.number().nullable(),
        totalSpeedLimitMbps: z.number().nullable(),
        trafficMultiplier: z.number().nullable(),
        hostCount: z.number(),
        paused: z.boolean(),
    });
    const user = z.object({
        id: z.string(),
        shortUuid: z.string(),
        username: z.string(),
        email: z.string().nullable(),
        telegramId: z.string().nullable(),
        status: z.string(),
        expireAt: z.iso.datetime(),
        tag: z.string().nullable(),
        onlineAt: z.iso.datetime().nullable(),
        lastConnectedNode: z.object({ name: z.string(), countryCode: z.string() }).nullable(),
        usedBytes: z.string(),
        baseLimitBytes: z.string(),
        bonusBytes: z.string(),
        limitBytes: z.string(),
        paused: z.boolean(),
        accessNow: z.boolean(),
        unlimited: z.boolean(),
    });
    const responses: Record<string, z.ZodType> = {
        '/api/limits': z.array(scope),
        '/api/limits/targets': z.array(
            z.object({
                type: z.enum(['INTERNAL', 'EXTERNAL']),
                uuid: z.string(),
                name: z.string(),
            }),
        ),
        '/api/limits/users': z.object({
            scope,
            users: z.array(user),
            total: z.number(),
            allUsers: z.number(),
            page: z.number(),
            pageSize: z.number(),
            summary: z.object({
                usedBytes: z.string(),
                pausedUsers: z.number(),
                exhaustedUsers: z.number(),
            }),
        }),
        '/api/limits/selection-state': z.object({
            total: z.number(),
            pausedUsers: z.number(),
            unlimitedUsers: z.number(),
            scopePaused: z.boolean(),
        }),
        '/api/limits/actions': z.object({
            affectedUsers: z.number(),
            replayed: z.boolean(),
            saved: z.boolean(),
            enforcement: z.string(),
        }),
        '/api/limits/unlimited': z.object({
            affectedUsers: z.number(),
            replayed: z.boolean(),
            saved: z.boolean(),
            enforcement: z.string(),
        }),
    };
    for (const [path, schema] of Object.entries(responses)) {
        const operation = document.paths[path]?.get ?? document.paths[path]?.post;
        if (!operation) continue;
        const code = document.paths[path]?.post ? '201' : '200';
        operation.responses[code] = {
            description: 'Successful operation. Byte counters are decimal strings.',
            content: { 'application/json': { schema: input(z.object({ response: schema })) } },
        };
    }
}

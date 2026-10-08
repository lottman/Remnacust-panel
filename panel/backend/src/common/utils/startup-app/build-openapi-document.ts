import { cleanupOpenApiDoc } from 'nestjs-zod';
import { readPackageJSON } from 'pkg-types';

import { INestApplication } from '@nestjs/common';
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core';
import { DocumentBuilder, getSchemaPath, OpenAPIObject } from '@nestjs/swagger';
import { SwaggerModule } from '@nestjs/swagger';

import { SCOPE_ENDPOINT, SCOPE_RESOURCE } from '@common/decorators/scopes';
import { CONTROLLERS_INFO } from '@libs/contracts/api';
import { ROLE, type EndpointDetails } from '@libs/contracts/constants';

import { documentLimits } from '@modules/hosts/limits.openapi';

import {
    RemnawaveWebhookCrmEventsDto,
    RemnawaveWebhookErrorsEventsDto,
    RemnawaveWebhookNodeEventsDto,
    RemnawaveWebhookServiceEventsDto,
    RemnawaveWebhookUserEventsDto,
    RemnawaveWebhookUserHwidDevicesEventsDto,
    RemnawaveWebhookTorrentBlockerEventsDto,
    RemnawaveNotFoundErrorDto,
    RemnawaveBadRequestErrorDto,
    RemnawaveInternalServerErrorDto,
    RemnawaveValidationErrorDto,
    RemnawaveUserUsageStreamMessageDto,
    RemnawaveSubscriptionRequestStreamMessageDto,
    RemnawaveNodeConnectionsStreamMessageDto,
} from './extra-models';

const description = `
Remnacust manages Xray users, nodes, configuration profiles and subscriptions.

## Resources
* https://t.me/lottman
* https://github.com/lottman/Remnacust-panel
`;

export async function createOpenApiDocumentFactory(
    app: INestApplication<unknown>,
): Promise<() => OpenAPIObject> {
    const pkg = await readPackageJSON();

    const configSwagger = new DocumentBuilder()
        .setTitle(`Remnacust API v${pkg.version}`)
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                name: 'Authorization',
                description: 'JWT obtained login.',
            },
            'Authorization',
        )
        .addBasicAuth(
            {
                type: 'http',
                scheme: 'basic',
                name: 'Prometheus',
                description: 'Prometheus Basic Auth',
            },
            'Prometheus',
        )
        .setDescription(description)
        .setVersion(pkg.version!)
        .setLicense(
            'AGPL-3.0',
            'https://github.com/lottman/Remnacust-panel/blob/main/LICENSE',
        )
        .addGlobalResponse({
            status: 404,
            description: 'Resource not found',

            content: {
                'application/json': {
                    schema: { $ref: getSchemaPath(RemnawaveNotFoundErrorDto) },
                },
            },
        })
        .addGlobalResponse({
            status: 400,
            description: 'Bad request / Validation error',

            content: {
                'application/json': {
                    schema: {
                        oneOf: [
                            { $ref: getSchemaPath(RemnawaveBadRequestErrorDto) },
                            { $ref: getSchemaPath(RemnawaveValidationErrorDto) },
                        ],
                    },
                },
            },
        })
        .addGlobalResponse({
            status: 500,
            description: 'Internal server error',

            content: {
                'application/json': {
                    schema: { $ref: getSchemaPath(RemnawaveInternalServerErrorDto) },
                },
            },
        });

    Object.values(CONTROLLERS_INFO).reduce((builder, { tag, description }) => {
        return builder.addTag(tag, description);
    }, configSwagger);

    const builtConfigSwagger = configSwagger.build();

    return () => {
        const document = cleanupOpenApiDoc(
            SwaggerModule.createDocument(app, builtConfigSwagger, {
                extraModels: [
                    RemnawaveWebhookUserEventsDto,
                    RemnawaveWebhookUserHwidDevicesEventsDto,
                    RemnawaveWebhookNodeEventsDto,
                    RemnawaveWebhookServiceEventsDto,
                    RemnawaveWebhookErrorsEventsDto,
                    RemnawaveWebhookCrmEventsDto,
                    RemnawaveWebhookTorrentBlockerEventsDto,
                    RemnawaveNotFoundErrorDto,
                    RemnawaveBadRequestErrorDto,
                    RemnawaveInternalServerErrorDto,
                    RemnawaveValidationErrorDto,
                    RemnawaveUserUsageStreamMessageDto,
                    RemnawaveSubscriptionRequestStreamMessageDto,
                    RemnawaveNodeConnectionsStreamMessageDto,
                ],
            }),
        );
        // Read the same metadata as ScopesGuard. No database, token or session data
        // is included in the published reference, including during preview builds.
        const reflector = new Reflector();
        const discovery = new DiscoveryService(app.get(ModulesContainer));
        const metadata = new Map<string, Record<string, unknown>>();
        for (const wrapper of discovery.getControllers()) {
            const controller = wrapper.metatype;
            if (!controller?.prototype) continue;
            const resource = reflector.get<string>(SCOPE_RESOURCE, controller);
            for (const name of Object.getOwnPropertyNames(controller.prototype)) {
                const handler = controller.prototype[name];
                if (name === 'constructor' || typeof handler !== 'function') continue;
                const roles = reflector.getAllAndOverride<string[]>(ROLE, [handler, controller]);
                const details = reflector.get<EndpointDetails>(SCOPE_ENDPOINT, handler);
                const token =
                    roles?.includes(ROLE.API) && resource && details?.SCOPE && details.SCOPE_KIND;
                metadata.set(`${controller.name}_${name}`, {
                    'x-remnacust-access': token
                        ? 'api-token'
                        : roles?.includes(ROLE.ADMIN)
                          ? 'admin'
                          : 'public',
                    ...(token
                        ? {
                              'x-remnacust-scope': `${resource}:${details.SCOPE}`,
                              'x-remnacust-resource': resource,
                              'x-remnacust-kind': details.SCOPE_KIND,
                          }
                        : {}),
                    ...(details ? { summary: details.METHOD_DESCRIPTION } : {}),
                });
            }
        }
        for (const path of Object.values(document.paths)) {
            if (!path) continue;
            for (const method of [
                'get',
                'post',
                'put',
                'patch',
                'delete',
                'head',
                'options',
            ] as const) {
                const operation = path[method];
                if (!operation) continue;
                Object.assign(
                    operation,
                    metadata.get(operation.operationId ?? '') ?? {
                        'x-remnacust-access': operation.security?.length ? 'special' : 'public',
                    },
                );
            }
        }
        documentLimits(document);
        return document;
    };
}

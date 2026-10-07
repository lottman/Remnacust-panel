import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import { SCOPE_ENDPOINT, SCOPE_RESOURCE } from '@common/decorators/scopes';
import { PANEL_ONLY_ENDPOINT } from '@common/decorators/admin-only-endpoint';
import { CONTROLLERS_INFO, ROOT } from '@libs/contracts/api';
import {
    buildActionScope,
    buildEndpointScope,
    buildResourceScope,
    EndpointDetails,
    normalizeControllerUrl,
    SCOPE_WILDCARD,
    ROLE,
    TRolesKeys,
} from '@libs/contracts/constants';

import { IGroupedScopeCatalog, IScopeCatalogEntry, IResourceScopes } from './interfaces';

const RESOURCE_ORDER: ReadonlyMap<string, number> = (() => {
    const order = new Map<string, number>();
    for (const info of Object.values(CONTROLLERS_INFO)) {
        if (!order.has(info.resource)) {
            order.set(info.resource, order.size);
        }
    }
    return order;
})();

@Injectable()
export class ScopeCatalogService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ScopeCatalogService.name);

    private readonly validScopes = new Set<string>([SCOPE_WILDCARD]);
    private readonly endpoints: IScopeCatalogEntry[] = [];

    constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly metadataScanner: MetadataScanner,
        private readonly reflector: Reflector,
    ) {}

    onApplicationBootstrap(): void {
        const controllers = this.discoveryService.getControllers();

        for (const wrapper of controllers) {
            const { instance, metatype } = wrapper;
            if (!instance || !metatype) {
                continue;
            }

            const resource = this.reflector.get<string | undefined>(SCOPE_RESOURCE, metatype);
            if (!resource) {
                continue;
            }

            const controllerBase = this.reflector.get<string | undefined>(PATH_METADATA, metatype);

            const prototype = Object.getPrototypeOf(instance);
            const methodNames = this.metadataScanner.getAllMethodNames(prototype);

            for (const methodName of methodNames) {
                const targets = [prototype[methodName], metatype];
                const roles = this.reflector.getAllAndOverride<TRolesKeys[]>(ROLE, targets);
                if (!roles?.includes(ROLE.API) ||
                    this.reflector.getAllAndOverride<boolean>(PANEL_ONLY_ENDPOINT, targets)) {
                    continue;
                }
                const details = this.reflector.get<EndpointDetails | undefined>(
                    SCOPE_ENDPOINT,
                    prototype[methodName],
                );

                if (!details?.SCOPE || !details.SCOPE_KIND) {
                    continue;
                }

                const key = buildEndpointScope(resource, details.SCOPE);

                if (this.validScopes.has(key)) {
                    throw new Error(
                        `Duplicate API token scope "${key}" — endpoint scope slugs must be unique within a resource`,
                    );
                }

                this.validScopes.add(key);
                this.validScopes.add(buildResourceScope(resource));
                this.validScopes.add(buildActionScope(resource, details.SCOPE_KIND));
                this.endpoints.push({
                    key,
                    resource,
                    kind: details.SCOPE_KIND,
                    method: details.REQUEST_METHOD.toUpperCase(),
                    path: this.buildPublicPath(controllerBase, details.CONTROLLER_URL),
                    description: details.METHOD_DESCRIPTION,
                });
            }
        }

        this.logger.log(
            `Scope catalog built: ${this.endpoints.length} endpoints, ${this.validScopes.size} grantable scopes`,
        );
    }

    private buildPublicPath(controllerBase: string | undefined, controllerUrl: string): string {
        const base = controllerBase ? `/${controllerBase}` : '';
        const rel = normalizeControllerUrl(controllerUrl);
        return rel === '/' ? `${ROOT}${base}` : `${ROOT}${base}${rel}`;
    }

    public findInvalidScopes(scopes: string[]): string[] {
        return scopes.filter((scope) => !this.validScopes.has(scope));
    }

    public getCatalog(): IScopeCatalogEntry[] {
        return this.endpoints;
    }

    public getGroupedCatalog(): IGroupedScopeCatalog {
        const byResource = new Map<string, IResourceScopes>();

        for (const entry of this.endpoints) {
            let group = byResource.get(entry.resource);
            if (!group) {
                group = {
                    resource: entry.resource,
                    resourceScopes: [
                        buildResourceScope(entry.resource),
                    ],
                    endpoints: [],
                };
                byResource.set(entry.resource, group);
            }

            const kindScope = buildActionScope(entry.resource, entry.kind);
            if (!group.resourceScopes.includes(kindScope)) group.resourceScopes.push(kindScope);

            group.endpoints.push({
                key: entry.key,
                kind: entry.kind,
                method: entry.method,
                path: entry.path,
                description: entry.description,
            });
        }

        return {
            wildcard: SCOPE_WILDCARD,
            resources: Array.from(byResource.values()).sort(
                (a, b) =>
                    (RESOURCE_ORDER.get(a.resource) ?? Number.MAX_SAFE_INTEGER) -
                    (RESOURCE_ORDER.get(b.resource) ?? Number.MAX_SAFE_INTEGER),
            ),
        };
    }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SCOPE_ENDPOINT, SCOPE_RESOURCE } from '@common/decorators/scopes';
import {
    buildActionScope,
    buildEndpointScope,
    buildResourceScope,
    EndpointDetails,
    ROLE,
    SCOPE_WILDCARD,
} from '@libs/contracts/constants';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

@Injectable()
export class ScopesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const resource = this.reflector.getAllAndOverride<string | undefined>(SCOPE_RESOURCE, [
            context.getHandler(),
            context.getClass(),
        ]);

        const request = context.switchToHttp().getRequest<{ user: IJWTAuthPayload }>();

        if (!request.user) return false;
        if (request.user.role === ROLE.ADMIN) return true;
        if (request.user.role !== ROLE.API) return false;

        // Missing metadata must never grant token access, including wildcard tokens.
        if (!resource) return false;
        const details = this.reflector.get<EndpointDetails | undefined>(
            SCOPE_ENDPOINT,
            context.getHandler(),
        );
        if (!details?.SCOPE || !details.SCOPE_KIND) return false;

        const scopes = request.user.scopes ?? [];
        if (scopes.length === 0) return false;
        if (scopes.includes(SCOPE_WILDCARD)) return true;

        if (scopes.includes(buildResourceScope(resource))) {
            return true;
        }

        if (details.SCOPE_KIND && scopes.includes(buildActionScope(resource, details.SCOPE_KIND))) {
            return true;
        }

        if (details.SCOPE && scopes.includes(buildEndpointScope(resource, details.SCOPE))) {
            return true;
        }

        return false;
    }
}

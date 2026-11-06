import { ForbiddenException } from '@nestjs/common';

import {
    buildActionScope,
    buildEndpointScope,
    buildResourceScope,
    ROLE,
} from '@libs/contracts/constants';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';

export function requireApiReadScope(
    user: Pick<IJWTAuthPayload, 'role' | 'scopes'> | undefined,
    resource: string,
    endpointScope: string,
): void {
    if (user?.role === ROLE.ADMIN) return;
    const grants = [
        '*',
        buildResourceScope(resource),
        buildActionScope(resource, 'read'),
        buildEndpointScope(resource, endpointScope),
    ];
    if (user?.role !== ROLE.API || !user.scopes?.some((scope) => grants.includes(scope))) {
        throw new ForbiddenException();
    }
}

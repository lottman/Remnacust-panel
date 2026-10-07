import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles/roles';
import { SCOPE_ENDPOINT } from '@common/decorators/scopes';
import { ROLE } from '@libs/contracts/constants';

export const PANEL_ONLY_ENDPOINT = 'xera:panel-only-endpoint';

// Keep dashboard operations available to administrators without granting them to API tokens.
// Place this above @Endpoint so its metadata overrides the endpoint's token scope.
export function AdminOnlyEndpoint() {
    return applyDecorators(
        Roles(ROLE.ADMIN),
        SetMetadata(PANEL_ONLY_ENDPOINT, true),
        SetMetadata(SCOPE_ENDPOINT, undefined),
        ApiExcludeEndpoint(),
    );
}

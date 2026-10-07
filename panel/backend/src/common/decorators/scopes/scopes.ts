import { SetMetadata } from '@nestjs/common';

import { EndpointDetails } from '@libs/contracts/constants';

export const SCOPE_RESOURCE = 'scope_resource';
export const SCOPE_ENDPOINT = 'scope_endpoint';

export const ApiScopeResource = (resource: string) => SetMetadata(SCOPE_RESOURCE, resource);
export const ApiScopeEndpoint = (details: EndpointDetails) => SetMetadata(SCOPE_ENDPOINT, details);

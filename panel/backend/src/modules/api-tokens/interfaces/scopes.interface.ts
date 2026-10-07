import { TEndpointScopeKind } from '@libs/contracts/constants';

export interface IScopeCatalogEntry {
    key: string;
    resource: string;
    kind: TEndpointScopeKind;
    method: string;
    path: string;
    description: string;
}

export interface IScopeEndpointEntry {
    key: string;
    kind: TEndpointScopeKind;
    method: string;
    path: string;
    description: string;
}

export interface IResourceScopes {
    resource: string;
    resourceScopes: string[];
    endpoints: IScopeEndpointEntry[];
}

export interface IGroupedScopeCatalog {
    wildcard: string;
    resources: IResourceScopes[];
}

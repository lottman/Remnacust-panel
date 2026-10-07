import { resolvePemCerts } from '@common/utils/certs';

export type TNodeIntegrationsPayload = Record<string, unknown>;

const CERTS_KEY = 'certs';

export function resolveIntegrationConfig(config: unknown): TNodeIntegrationsPayload {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return {};
    }

    const resolved = { ...(config as TNodeIntegrationsPayload) };

    if (Object.hasOwn(resolved, CERTS_KEY)) {
        resolved[CERTS_KEY] = resolvePemCerts(resolved[CERTS_KEY]);
    }

    return resolved;
}

export function mergeNodeIntegrations(
    configs: TNodeIntegrationsPayload[],
): TNodeIntegrationsPayload {
    // Defining own properties avoids invoking the legacy __proto__ setter.
    return Object.fromEntries(configs.flatMap((config) => Object.entries(config)));
}

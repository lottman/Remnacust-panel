export function withTemplateGeofilePolicy(
    config: Record<string, unknown>,
    enabled: boolean,
): Record<string, unknown> {
    const options = config.remnacust;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return config;
    return { ...config, remnacust: { ...options, geofilesEnabled: enabled === true } };
}

export function templateGeofilesEnabled(config: Record<string, unknown>): boolean {
    const options = config.remnacust;
    return (
        !!options &&
        typeof options === 'object' &&
        !Array.isArray(options) &&
        (options as Record<string, unknown>).geofilesEnabled === true
    );
}

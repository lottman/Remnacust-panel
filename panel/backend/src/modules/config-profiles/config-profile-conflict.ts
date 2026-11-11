export function configProfileConflict(error: unknown): 'tag' | 'name' | undefined {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return;
    const meta =
        'meta' in error && error.meta && typeof error.meta === 'object'
            ? (error.meta as Record<string, unknown>)
            : undefined;
    if (!meta) return;
    const model = meta.modelName;
    if (Array.isArray(meta.target) && meta.target.length === 1) {
        if (
            meta.target[0] === 'tag' &&
            (model === 'ConfigProfileInbounds' || model === 'ConfigProfiles')
        )
            return 'tag';
        if (meta.target[0] === 'name' && model === 'ConfigProfiles') return 'name';
    }
    const adapter = meta.driverAdapterError;
    if (!adapter || typeof adapter !== 'object' || !('cause' in adapter)) return;
    const cause = adapter.cause;
    if (
        !cause ||
        typeof cause !== 'object' ||
        !('kind' in cause) ||
        cause.kind !== 'UniqueConstraintViolation' ||
        !('constraint' in cause)
    )
        return;
    const constraint = cause.constraint;
    if (!constraint || typeof constraint !== 'object') return;
    if ('index' in constraint) {
        if (constraint.index === 'config_profile_inbounds_tag_key') return 'tag';
        if (constraint.index === 'config_profiles_name_key') return 'name';
    }
    if (
        'fields' in constraint &&
        Array.isArray(constraint.fields) &&
        constraint.fields.length === 1
    ) {
        if (
            constraint.fields[0] === 'tag' &&
            'table' in cause &&
            cause.table === 'config_profile_inbounds'
        )
            return 'tag';
        if (
            constraint.fields[0] === 'name' &&
            'table' in cause &&
            cause.table === 'config_profiles'
        )
            return 'name';
    }
    return;
}

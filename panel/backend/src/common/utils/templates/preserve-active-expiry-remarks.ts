import type { TCustomRemarks } from '@libs/contracts/models/subscription-settings/custom-remarks.schema';

export function preserveActiveExpiryRemarks<T extends TCustomRemarks | null | undefined>(
    incoming: T,
    previous: unknown,
): T {
    if (
        !incoming ||
        Object.hasOwn(incoming, 'activeExpiry') ||
        !previous ||
        typeof previous !== 'object' ||
        !Object.hasOwn(previous, 'activeExpiry')
    )
        return incoming;
    return { ...incoming, activeExpiry: (previous as TCustomRemarks).activeExpiry };
}

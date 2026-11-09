import { AsyncLocalStorage } from 'node:async_hooks';

export type SubscriptionDomainContext = {
    uuid: string;
    publicBaseUrl: string;
    requestHeaderName?: string;
    requestHeaderValue?: string;
};
const domains = new AsyncLocalStorage<SubscriptionDomainContext>();
export const currentSubscriptionDomain = () => domains.getStore();
export function withSubscriptionDomain<T>(domain: SubscriptionDomainContext, run: () => T): T {
    const previous = domains.getStore();
    return domains.run(previous?.uuid === domain.uuid ? { ...previous, ...domain } : domain, run);
}

export function subscriptionDomainRequestHeaders(): Record<string, string> {
    const domain = domains.getStore();
    return {
        ...(domain ? { 'x-remnacust-geofile-origin': new URL(domain.publicBaseUrl).origin } : {}),
        ...(domain?.requestHeaderName && domain.requestHeaderValue
            ? { [domain.requestHeaderName]: domain.requestHeaderValue }
            : {}),
    };
}

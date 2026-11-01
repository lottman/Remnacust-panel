import { AsyncLocalStorage } from 'node:async_hooks';

export type SubscriptionDomainContext = { uuid: string; publicBaseUrl: string };
const domains = new AsyncLocalStorage<SubscriptionDomainContext>();
export const currentSubscriptionDomain = () => domains.getStore();
export function withSubscriptionDomain<T>(domain: SubscriptionDomainContext, run: () => T): T {
    return domains.run(domain, run);
}

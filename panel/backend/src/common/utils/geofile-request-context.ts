import { AsyncLocalStorage } from 'node:async_hooks';

const origins = new AsyncLocalStorage<string | undefined>();
export function withGeofileOrigin<T>(origin: string | undefined, operation: () => T): T {
    return origins.run(origin, operation);
}
export function requestGeofileBase(fallback: string): string {
    const origin = origins.getStore();
    return origin ? origin + '/geofiles/' : fallback;
}

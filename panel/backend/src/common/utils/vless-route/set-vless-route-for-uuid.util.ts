const HEX_CHARS = '0123456789abcdef';

export function setVlessRouteForUuid(uuid: string, routeId: number | undefined | null): string {
    if (!routeId || typeof routeId !== 'number') {
        return uuid;
    }

    const h1 = HEX_CHARS[(routeId >> 12) & 0xf];
    const h2 = HEX_CHARS[(routeId >> 8) & 0xf];
    const h3 = HEX_CHARS[(routeId >> 4) & 0xf];
    const h4 = HEX_CHARS[routeId & 0xf];

    return uuid.substring(0, 14) + h1 + h2 + h3 + h4 + uuid.substring(18);
}

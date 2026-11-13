export const PRESET_GEOFILE_URLS = new Set([
    'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat',
    'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat',
    'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat',
    'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat',
    'https://github.com/v2fly/geoip/releases/latest/download/private.dat',
    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite-lite.dat',
]);

export type GeofileOrigin = 'preset' | 'upload' | 'import' | 'copy';

export function geofileProvenance(origin?: GeofileOrigin, sourceUrl?: string) {
    const protectedFile =
        origin === 'preset' ||
        (origin !== 'copy' && sourceUrl !== undefined && PRESET_GEOFILE_URLS.has(sourceUrl));
    return {
        origin: protectedFile ? ('preset' as const) : (origin ?? (sourceUrl ? 'import' : 'upload')),
        editPolicy: protectedFile ? ('copy' as const) : ('edit' as const),
    };
}

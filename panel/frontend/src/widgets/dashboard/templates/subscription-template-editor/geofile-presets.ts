// Published DAT assets; imports still pass through the server's URL and content validation.
export const geofilePresets = [
    {
        id: 'v2fly-geoip',
        name: 'V2Fly GeoIP',
        kind: 'geoip',
        provider: 'V2Fly',
        description: 'countries',
        url: 'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat'
    },
    {
        id: 'v2fly-geosite',
        name: 'V2Fly GeoSite',
        kind: 'geosite',
        provider: 'V2Fly',
        description: 'domains',
        url: 'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat'
    },
    {
        id: 'v2fly-private',
        name: 'V2Fly Private IP',
        kind: 'geoip',
        provider: 'V2Fly',
        description: 'private',
        url: 'https://github.com/v2fly/geoip/releases/latest/download/private.dat'
    },
    {
        id: 'metacubex-geoip',
        name: 'MetaCubeX GeoIP',
        kind: 'geoip',
        provider: 'MetaCubeX',
        description: 'countries',
        url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat'
    },
    {
        id: 'metacubex-geosite',
        name: 'MetaCubeX GeoSite',
        kind: 'geosite',
        provider: 'MetaCubeX',
        description: 'domains',
        url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat'
    },
    {
        id: 'metacubex-geosite-lite',
        name: 'MetaCubeX GeoSite Lite',
        kind: 'geosite',
        provider: 'MetaCubeX',
        description: 'lite',
        url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite-lite.dat'
    }
] as const

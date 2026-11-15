import type { StoredGeofile } from './geofiles.service';
import type { DatKind } from './xray-geofile-delivery';

const sources = {
    geosite: [
        'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat',
        'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
        'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat',
    ],
    geoip: [
        'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat',
        'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
        'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat',
    ],
};

export function standardDat(files: StoredGeofile[], kind: DatKind): StoredGeofile | undefined {
    for (const source of sources[kind]) {
        const file = files
            .filter(
                (item) =>
                    item.kind === kind &&
                    item.origin === 'preset' &&
                    item.editPolicy === 'copy' &&
                    item.refresh?.sourceUrl === source &&
                    Number.isFinite(Date.parse(item.refresh?.lastSuccessAt ?? '')),
            )
            .sort((left, right) => left.id.localeCompare(right.id))[0];
        if (file) return file;
    }
}

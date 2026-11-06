import { SocksProxyAgent } from 'socks-proxy-agent';

import { IMtlsOptions } from './axios.interfaces';
import { parseSocksProxyUrl } from '../../../libs/contract/models/socks-proxy.schema';

type SocksConnectOpts = Parameters<SocksProxyAgent['connect']>[1];

export class MtlsSocksProxyAgent extends SocksProxyAgent {
    constructor(
        uri: string,
        private readonly mtls: IMtlsOptions,
        private readonly sni: string | undefined,
    ) {
        if (!parseSocksProxyUrl(uri)) throw new Error('Invalid node SOCKS5 proxy configuration');
        super(uri, { keepAlive: true });
    }

    async connect(
        req: Parameters<SocksProxyAgent['connect']>[0],
        opts: SocksConnectOpts,
    ): ReturnType<SocksProxyAgent['connect']> {
        return super.connect(req, {
            ...opts,
            ...this.mtls,
            checkServerIdentity: () => undefined,
            minVersion: 'TLSv1.3',
            rejectUnauthorized: true,
            servername: this.sni,
        } as SocksConnectOpts);
    }
}

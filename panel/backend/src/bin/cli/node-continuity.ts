import type { PrismaClient } from '@prisma/client';

import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import https from 'node:https';
import { isIP } from 'node:net';

import { MtlsSocksProxyAgent } from '@common/axios/mtls-agent';
import {
    checkNodeContinuity,
    NODE_CONTINUITY_SQL,
    ContinuityNode,
    ContinuityStatus,
} from '@common/host-policy/node-continuity';
import { deriveSni } from '@common/utils/certs';

export async function checkInstalledNodeContinuity(prisma: PrismaClient) {
    const keys = await prisma.keygen.findFirst();
    const agents = new Set<https.Agent>();
    try {
        // An empty roster needs no credentials (e.g. a fresh panel).
        const read = () =>
            prisma.$transaction(
                async (tx) => {
                    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
                    await tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`;
                    return tx.$queryRawUnsafe<ContinuityNode[]>(NODE_CONTINUITY_SQL);
                },
                { maxWait: 2000, timeout: 10000 },
            );
        return await checkNodeContinuity(read, async (node) => {
            if (!keys?.privKey || !keys.clientCert || !keys.clientKey || !keys.caCert)
                throw new Error('NODE_CREDENTIALS_UNAVAILABLE');
            if (
                !node.address ||
                /[\s/@?#\\]/.test(node.address) ||
                (!isIP(node.address) && !/^[a-zA-Z0-9.-]+$/.test(node.address)) ||
                (node.port !== null &&
                    (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535))
            )
                throw new Error('INVALID_NODE_ENDPOINT');
            const servername =
                process.env.SERVICE_SNI_VERIFICATION === 'false'
                    ? undefined
                    : deriveSni(keys.caCert, keys.pubKey);
            const mtls = { cert: keys.clientCert, key: keys.clientKey, ca: keys.caCert };
            const agent = node.proxyUrl
                ? new MtlsSocksProxyAgent(node.proxyUrl, mtls, servername)
                : new https.Agent({
                      ...mtls,
                      servername,
                      rejectUnauthorized: true,
                      checkServerIdentity: () => undefined,
                      minVersion: 'TLSv1.3',
                  });
            agents.add(agent);
            const host = isIP(node.address) === 6 ? `[${node.address}]` : node.address;
            const port = node.port ? `:${node.port}` : '';
            const token = jwt.sign({ uuid: null, username: null, role: 'API' }, keys.privKey, {
                algorithm: 'RS256',
                expiresIn: '60s',
            });
            const response = await axios.get<{ response: ContinuityStatus }>(
                `https://${host}${port}/node/xray/host-policy`,
                {
                    httpsAgent: agent,
                    proxy: false,
                    maxRedirects: 0,
                    timeout: 8000,
                    maxContentLength: 4 * 1024 * 1024,
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                },
            );
            return response.data.response;
        });
    } finally {
        for (const agent of agents) agent.destroy();
    }
}

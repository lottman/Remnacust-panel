import { ERRORS } from '@contract/constants';
import axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    AxiosResponse,
    RawAxiosRequestHeaders,
} from 'axios';
import { createHash } from 'node:crypto';
import https from 'node:https';
import { isIP } from 'node:net';
import { promisify } from 'node:util';
import { constants as zlibConstants, zstdCompress, ZstdOptions } from 'node:zlib';

import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import {
    AddUserCommand,
    AddUsersCommand,
    BlockIpsCommand,
    CollectReportsCommand,
    DropIpsCommand,
    DropUsersConnectionsCommand,
    GetAllInboundsStatsCommand,
    GetAllOutboundsStatsCommand,
    GetCombinedStatsCommand,
    GetGeocheckCommand,
    GetNodeHealthCheckCommand,
    GetSystemStatsCommand,
    GetUserIpListCommand,
    GetUsersIpListCommand,
    GetUsersStatsCommand,
    RecreateTablesCommand,
    RemoveUserCommand,
    RemoveUsersCommand,
    StartXrayCommand,
    StopXrayCommand,
    SyncCommand,
    UnblockIpsCommand,
} from '@remnawave/node-contract';

import { RawCacheService } from '@common/raw-cache';
import { TypedConfigService } from '@common/config/app-config/typed-config.service';
import { prettyBytesUtil } from '@common/utils/bytes';
import { deriveSni } from '@common/utils/certs';
import { formatExecutionTime, getTime } from '@common/utils/get-elapsed-time';
import {
    nodeSupportsBulkUsers,
    nodeSupportsCompression,
    nodeSupportsPlugins,
    nodeSupportsWrappedConfig,
} from '@common/utils/node-version';

import { GetNodeJwtCommand } from '@modules/keygen/commands/get-node-jwt';

import { fail, ok, TResult } from '../types';
import {
    INodeConnectionOpts,
    INodeRequestOpts,
    IMtlsOptions,
    INodeStartResponse,
    INodeSystemStatsResponse,
} from './axios.interfaces';
import { MtlsSocksProxyAgent } from './mtls-agent';

const EMPTY_BODY: Readonly<Record<string, never>> = {};
const MAX_NODE_ERROR_LENGTH = 2000;
const ZSTD_HEADERS: RawAxiosRequestHeaders = { 'Content-Encoding': 'zstd' };

const zstdCompressAsync = promisify(zstdCompress);

const ZSTD_OPTIONS: ZstdOptions = {
    params: {
        [zlibConstants.ZSTD_c_compressionLevel]: 1,
        [zlibConstants.ZSTD_c_enableLongDistanceMatching]: 1,
        [zlibConstants.ZSTD_c_windowLog]: 25,
    },
    chunkSize: 1024 * 1024,
};

@Injectable()
export class AxiosService {
    private initialization?: Promise<void>;
    private readonly nodeVersions = new Map<string, { version: string; expires: number }>();
    private readonly versionRequests = new Map<string, Promise<TResult<string>>>();

    private connectionKey(opts: INodeConnectionOpts): string {
        return JSON.stringify([opts.address, opts.port, opts.proxyUrl]);
    }

    private inboundTagsKey(opts: INodeConnectionOpts): string {
        return `remnacust:node-api:inbounds:${createHash('sha256').update(this.connectionKey(opts)).digest('hex')}`;
    }

    private rememberVersion(opts: INodeConnectionOpts, version: string): void {
        const key = this.connectionKey(opts);
        this.nodeVersions.delete(key);
        if (this.nodeVersions.size >= 1000)
            this.nodeVersions.delete(this.nodeVersions.keys().next().value!);
        this.nodeVersions.set(key, { version, expires: Date.now() + 60_000 });
    }

    private async getNodeVersion(opts: INodeConnectionOpts): Promise<TResult<string>> {
        const key = this.connectionKey(opts);
        const known = this.nodeVersions.get(key);
        if (known && known.expires > Date.now()) return ok(known.version);
        const existing = this.versionRequests.get(key);
        if (existing) return existing;
        const request = this.getNodeHealth(opts)
            .then((result): TResult<string> =>
                result.isOk ? ok(result.response.nodeVersion) : result,
            )
            .finally(() => this.versionRequests.delete(key));
        this.versionRequests.set(key, request);
        return request;
    }
    public nodeRuntime(opts: INodeConnectionOpts): Promise<TResult<unknown>> {
        return this.request<{ response: unknown }>({
            label: 'NODE RUNTIME',
            opts,
            path: '/node/stats/runtime',
            method: 'get',
            timeout: 6000,
            logAxiosError: false,
        });
    }
    public async hostPolicy<T>(opts: INodeConnectionOpts, data?: unknown): Promise<TResult<T>> {
        return this.request<{ response: T }>({
            label: 'HOST POLICY',
            opts,
            path: '/node/xray/host-policy',
            method: data ? 'post' : 'get',
            data,
            timeout: 8_000,
            logAxiosError: false,
        });
    }
    public async managedCore<T>(opts: INodeConnectionOpts, data?: unknown): Promise<TResult<T>> {
        return this.request<{ response: T }>({
            label: 'MANAGED CORE',
            opts,
            path: data ? '/node/xray/managed-core/actions' : '/node/xray/managed-core',
            method: data ? 'post' : 'get',
            data,
            timeout: data ? 15_000 : 8_000,
            logAxiosError: false,
        });
    }
    private readonly logger = new Logger(AxiosService.name);

    public axiosInstance: AxiosInstance;
    private mtlsOptions: IMtlsOptions;
    private servername: string | undefined;
    private readonly socksAgentCache = new Map<string, MtlsSocksProxyAgent>();

    constructor(
        private readonly commandBus: CommandBus,
        private readonly rawCacheService: RawCacheService,
        private readonly configService: TypedConfigService,
    ) {
        this.axiosInstance = axios.create({
            timeout: 45_000,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
    }

    public async setJwt() {
        try {
            const result = await this.commandBus.execute(new GetNodeJwtCommand());

            if (!result.isOk) {
                throw new Error(
                    'There are a problem with the JWT token. Please restart Remnawave.',
                );
            }

            const jwt = result.response;

            this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${jwt.jwtToken}`;

            this.servername = this.configService.getOrThrow('SERVICE_SNI_VERIFICATION')
                ? deriveSni(jwt.caCert, jwt.jwtPublicKey)
                : undefined;

            this.mtlsOptions = {
                cert: jwt.clientCert,
                key: jwt.clientKey,
                ca: jwt.caCert,
            };

            const httpsAgent = new https.Agent({
                ...this.mtlsOptions,
                checkServerIdentity: () => undefined,
                rejectUnauthorized: true,
                keepAlive: true,
                minVersion: 'TLSv1.3',
                servername: this.servername,
            });

            this.axiosInstance.defaults.httpsAgent = httpsAgent;

            this.logger.log('Interceptor registered');
            this.logger.log(`Node SNI: ${this.servername}`);
        } catch (error) {
            this.logger.error(`Error in onApplicationBootstrap: ${error}`);
            throw error;
        }
    }

    private resolveAgent(proxyUrl: null | string): https.Agent {
        if (!proxyUrl) {
            return this.axiosInstance.defaults.httpsAgent as https.Agent;
        }

        const cached = this.socksAgentCache.get(proxyUrl);
        if (cached) return cached;

        const httpsAgent = new MtlsSocksProxyAgent(proxyUrl, this.mtlsOptions, this.servername);
        this.socksAgentCache.set(proxyUrl, httpsAgent);

        return httpsAgent;
    }

    private getNodeUrl(url: string, path: string, port: null | number): string {
        const host = isIP(url) === 6 ? `[${url}]` : url;
        const authority = port ? `${host}:${port}` : host;
        // Pre-1.5 nodes used HTTP. Never downgrade after a TLS/authentication error.
        // A tunnel endpoint must be explicitly listed by the operator.
        const legacyHttp = (process.env.REMNACUST_LEGACY_HTTP_NODES ?? '')
            .split(',')
            .some((entry) => entry.trim() === authority);
        return `${legacyHttp ? 'http' : 'https'}://${authority}${path}`;
    }

    private extractNodeError(error: AxiosError): string {
        const data = error.response?.data;

        let reason: string | undefined;

        if (typeof data === 'string') {
            reason = data;
        } else if (data && typeof data === 'object') {
            const body = data as { error?: unknown; message?: unknown };

            reason =
                typeof body.message === 'string'
                    ? body.message
                    : typeof body.error === 'string'
                      ? body.error
                      : JSON.stringify(data);
        }

        reason = reason?.trim();

        if (!reason) {
            return error.message;
        }

        return reason.length > MAX_NODE_ERROR_LENGTH
            ? `${reason.slice(0, MAX_NODE_ERROR_LENGTH)}…`
            : reason;
    }

    private async request<TResponse extends { response: unknown }>(
        params: INodeRequestOpts,
    ): Promise<TResult<TResponse['response']>> {
        const {
            label,
            opts,
            path,
            data,
            compress: useCompression = false,
            handle500 = false,
            internalError = false,
            logAxiosError = true,
            method = 'post',
            timeout,
        } = params;

        const url = this.getNodeUrl(opts.address, path, opts.port);
        try {
            // API and scheduler processes also send direct node commands. Only
            // processors initialize eagerly; every caller needs the same mTLS/JWT setup.
            if (!this.mtlsOptions) {
                this.initialization ??= this.setJwt().catch((error) => {
                    this.initialization = undefined;
                    throw error;
                });
                await this.initialization;
            }
            const httpsAgent = this.resolveAgent(opts.proxyUrl);
            let body: unknown = EMPTY_BODY;
            let headers: RawAxiosRequestHeaders | undefined;

            if (method === 'post') {
                body = data ?? EMPTY_BODY;

                if (
                    useCompression &&
                    nodeSupportsCompression(
                        this.nodeVersions.get(this.connectionKey(opts))?.version,
                    )
                ) {
                    const startTime = getTime();
                    const { buffer: compressedData, size } = await this.compressData(data);

                    this.logger.log(
                        `[ZSTD] [${label}] ${formatExecutionTime(startTime)} | ${prettyBytesUtil(size)} -> ${prettyBytesUtil(compressedData.length)}`,
                    );

                    body = compressedData;
                    headers = ZSTD_HEADERS;
                }
            }

            // A node cannot redirect the panel's authenticated request to another service.
            const config: AxiosRequestConfig = { headers, httpsAgent, timeout, maxRedirects: 0 };
            if (opts.proxyUrl && url.startsWith('http://')) config.httpAgent = httpsAgent;

            const response: AxiosResponse<TResponse> =
                method === 'get'
                    ? await this.axiosInstance.get<TResponse>(url, config)
                    : await this.axiosInstance.post<TResponse>(url, body, config);

            if (
                !response.data ||
                !Object.hasOwn(response.data, 'response') ||
                response.data.response === undefined
            ) {
                return fail(
                    ERRORS.NODE_ERROR_WITH_MSG.withMessage('Node returned an invalid API response'),
                );
            }
            return ok(response.data.response);
        } catch (error) {
            if (internalError) {
                return this.failWithInternalError(label, error);
            }

            if (error instanceof AxiosError) {
                if (logAxiosError) {
                    this.logger.error(`Error in Axios ${label} request: ${error.message}`);
                }

                if (label === 'MANAGED CORE') {
                    const detail = error.response?.status
                        ? `Node API returned HTTP ${error.response.status}`
                        : `Node connection failed (${error.code ?? 'network error'})`;
                    return fail(ERRORS.NODE_ERROR_WITH_MSG.withMessage(detail));
                }

                if (handle500 && error.response?.status === 500) {
                    return fail(
                        ERRORS.NODE_ERROR_500_WITH_MSG.withMessage(this.extractNodeError(error)),
                    );
                }

                return {
                    ...fail(ERRORS.NODE_ERROR_WITH_MSG.withMessage(JSON.stringify(error.message))),
                    code: error.response?.status
                        ? `NODE_HTTP_${error.response.status}`
                        : error.code,
                };
            }

            this.logger.error(`Error in ${label}: ${error}`);

            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage(JSON.stringify(error) ?? 'Unknown error'),
            );
        }
    }

    /*
     * XRAY MANAGEMENT
     */

    public async startXray(
        data: StartXrayCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<INodeStartResponse>> {
        const version = await this.getNodeVersion(opts);
        if (!version.isOk) return version;
        const result = await this.request<{ response: INodeStartResponse }>({
            label: 'START XRAY',
            path: StartXrayCommand.url,
            opts,
            data: nodeSupportsWrappedConfig(version.response) ? data : data.xrayConfig,
            compress: true,
            logAxiosError: false,
            timeout: 60_000,
        });
        if (!result.isOk) return result;
        const response = result.response;
        if (!response || typeof response.isStarted !== 'boolean') {
            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage('Node returned an invalid start response'),
            );
        }
        const actualVersion = response.nodeInformation?.version ?? version.response;
        this.rememberVersion(opts, actualVersion ?? '');
        if (response.isStarted) {
            const inbounds = data.xrayConfig.inbounds;
            if (Array.isArray(inbounds)) {
                await this.rawCacheService.setMany([
                    {
                        key: this.inboundTagsKey(opts),
                        value: inbounds
                            .map((inbound) => inbound.tag)
                            .filter((tag): tag is string => typeof tag === 'string'),
                    },
                ]);
            }
        }
        return ok({
            ...response,
            nodeInformation: { version: actualVersion || null },
            system: response.system ?? null,
        });
    }

    public async stopXray(
        opts: INodeConnectionOpts,
    ): Promise<TResult<StopXrayCommand.Response['response']>> {
        return this.request<StopXrayCommand.Response>({
            label: 'STOP XRAY',
            path: StopXrayCommand.url,
            opts,
            method: 'get',
        });
    }

    public async getNodeHealth(
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetNodeHealthCheckCommand.Response['response']>> {
        let result = await this.request<GetNodeHealthCheckCommand.Response>({
            label: 'GET NODE HEALTH',
            path: GetNodeHealthCheckCommand.url,
            opts,
            method: 'get',
            logAxiosError: false,
            timeout: 15_000,
        });
        if (!result.isOk && ['NODE_HTTP_404', 'NODE_HTTP_405'].includes(result.code ?? '')) {
            const legacy = await this.request<{
                response: { isRunning: boolean; version: string | null };
            }>({
                label: 'GET LEGACY NODE STATUS',
                path: '/node/xray/status',
                opts,
                method: 'get',
                logAxiosError: false,
                timeout: 15_000,
            });
            if (!legacy.isOk) return legacy;
            if (!legacy.response || typeof legacy.response.isRunning !== 'boolean') {
                return fail(
                    ERRORS.NODE_ERROR_WITH_MSG.withMessage(
                        'Node returned an invalid status response',
                    ),
                );
            }
            result = ok({
                isAlive: true,
                xrayInternalStatusCached: legacy.response.isRunning,
                xrayVersion: legacy.response.version,
                nodeVersion: '',
            });
        }
        if (!result.isOk) return result;
        if (!result.response || typeof result.response.isAlive !== 'boolean') {
            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage('Node returned an invalid health response'),
            );
        }
        const version =
            typeof result.response.nodeVersion === 'string' ? result.response.nodeVersion : '';
        this.rememberVersion(opts, version);
        return ok({ ...result.response, nodeVersion: version });
    }

    public async getNodeXrayLogs(opts: INodeConnectionOpts): Promise<TResult<{ lines: string[] }>> {
        return this.request<{ response: { lines: string[] } }>({
            label: 'GET NODE XRAY LOGS',
            path: '/node/xray/logs',
            opts,
            method: 'get',
            logAxiosError: false,
            timeout: 15_000,
        });
    }

    /*
     * STATS MANAGEMENT
     */

    public async getUsersStats(
        data: GetUsersStatsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUsersStatsCommand.Response['response']>> {
        return this.request<GetUsersStatsCommand.Response>({
            label: 'GET USERS STATS',
            path: GetUsersStatsCommand.url,
            opts,
            data,
            timeout: 15_000,
        });
    }

    public async getIpsList(
        data: GetUserIpListCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUserIpListCommand.Response['response']>> {
        return this.request<GetUserIpListCommand.Response>({
            label: 'GET IPS LIST',
            path: GetUserIpListCommand.url,
            opts,
            data,
            logAxiosError: false,
            timeout: 5_000,
        });
    }

    public async getUsersIpsList(
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetUsersIpListCommand.Response['response']>> {
        return this.request<GetUsersIpListCommand.Response>({
            label: 'GET USERS IPS LIST',
            path: GetUsersIpListCommand.url,
            opts,
            method: 'get',
            logAxiosError: false,
            timeout: 10_000,
        });
    }

    public async getSystemStats(
        opts: INodeConnectionOpts,
    ): Promise<TResult<INodeSystemStatsResponse>> {
        const result = await this.request<{
            response: INodeSystemStatsResponse & { uptime?: number };
        }>({
            label: 'GET SYSTEM STATS',
            path: GetSystemStatsCommand.url,
            opts,
            method: 'get',
            handle500: true,
            logAxiosError: false,
            timeout: 15_000,
        });
        if (!result.isOk) return result;
        const response = result.response;
        const xray =
            response && (Object.hasOwn(response, 'xrayInfo') ? response.xrayInfo : response);
        if (!response || (xray !== null && (!xray || !Number.isFinite(xray.uptime)))) {
            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage('Node returned invalid system statistics'),
            );
        }
        return ok({
            ...response,
            xrayInfo: Object.hasOwn(response, 'xrayInfo')
                ? response.xrayInfo
                : (response as unknown as NonNullable<INodeSystemStatsResponse['xrayInfo']>),
            system: response.system ?? null,
        });
    }

    public async getCombinedStats(
        data: GetCombinedStatsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetCombinedStatsCommand.Response['response']>> {
        const result = await this.request<GetCombinedStatsCommand.Response>({
            label: 'GET COMBINED STATS',
            path: GetCombinedStatsCommand.url,
            opts,
            data,
            handle500: true,
            logAxiosError: false,
        });
        if (result.isOk || !['NODE_HTTP_404', 'NODE_HTTP_405'].includes(result.code ?? ''))
            return result;
        const [inbounds, outbounds] = await Promise.all([
            this.request<GetAllInboundsStatsCommand.Response>({
                label: 'GET LEGACY INBOUND STATS',
                path: GetAllInboundsStatsCommand.url,
                opts,
                data,
                handle500: true,
                logAxiosError: false,
            }),
            this.request<GetAllOutboundsStatsCommand.Response>({
                label: 'GET LEGACY OUTBOUND STATS',
                path: GetAllOutboundsStatsCommand.url,
                opts,
                data,
                handle500: true,
                logAxiosError: false,
            }),
        ]);
        if (!inbounds.isOk) return inbounds;
        if (!outbounds.isOk) return outbounds;
        return ok({
            inbounds: inbounds.response.inbounds,
            outbounds: outbounds.response.outbounds,
        });
    }

    public async getGeocheck(
        data: GetGeocheckCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<GetGeocheckCommand.Response['response']>> {
        return this.request<GetGeocheckCommand.Response>({
            label: 'GET GEO CHECK',
            path: GetGeocheckCommand.url,
            opts,
            data,
            handle500: true,
            logAxiosError: false,
            timeout: 55_000,
        });
    }

    /*
     * User management
     */

    public async addUser(
        data: AddUserCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<AddUserCommand.Response['response']>> {
        const version = await this.getNodeVersion(opts);
        if (!version.isOk) return version;
        const userData = nodeSupportsWrappedConfig(version.response)
            ? data
            : {
                  ...data,
                  data: data.data.map((item) =>
                      item.type === 'shadowsocks22'
                          ? { ...item, type: 'shadowsocks2022', key: item.password }
                          : item,
                  ),
              };
        return this.request<AddUserCommand.Response>({
            label: 'ADD USER',
            path: AddUserCommand.url,
            opts,
            data: userData,
            timeout: 20_000,
        });
    }

    public async deleteUser(
        data: RemoveUserCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<RemoveUserCommand.Response['response']>> {
        const result = await this.request<RemoveUserCommand.Response>({
            label: 'DELETE USER',
            path: RemoveUserCommand.url,
            opts,
            data,
            logAxiosError: false,
            timeout: 20_000,
        });
        if (result.isOk || result.code !== 'NODE_HTTP_400') return result;
        const version = await this.getNodeVersion(opts);
        if (!version.isOk) return version;
        if (nodeSupportsWrappedConfig(version.response)) return result;
        let tags = await this.rawCacheService.get<string[]>(this.inboundTagsKey(opts));
        if (!tags?.length) {
            const inbounds = await this.request<GetAllInboundsStatsCommand.Response>({
                label: 'GET LEGACY INBOUND TAGS',
                path: GetAllInboundsStatsCommand.url,
                opts,
                data: { reset: false },
                logAxiosError: false,
            });
            if (!inbounds.isOk) return inbounds;
            tags = inbounds.response.inbounds.map((inbound) => inbound.inbound);
        }
        if (!tags?.length)
            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage(
                    'Legacy node inbound tags are unavailable; restart the node from the panel before removing users',
                ),
            );
        return this.request<RemoveUserCommand.Response>({
            label: 'DELETE LEGACY USER',
            path: RemoveUserCommand.url,
            opts,
            data: { ...data, tags },
            logAxiosError: false,
            timeout: 20_000,
        });
    }

    public async addUsers(
        data: AddUsersCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<AddUsersCommand.Response['response']>> {
        const version = await this.getNodeVersion(opts);
        if (!version.isOk) return version;
        if (!nodeSupportsBulkUsers(version.response)) {
            return this.legacyBulk(data.users, async ({ inboundData, userData }) =>
                this.addUser(
                    {
                        hashData: { vlessUuid: userData.hashUuid },
                        data: inboundData.map((inbound): AddUserCommand.Request['data'][number] => {
                            const common = { tag: inbound.tag, username: userData.userId };
                            switch (inbound.type) {
                                case 'vless':
                                    return {
                                        ...common,
                                        type: 'vless',
                                        uuid: userData.vlessUuid,
                                        flow: inbound.flow,
                                    };
                                case 'trojan':
                                    return {
                                        ...common,
                                        type: 'trojan',
                                        password: userData.trojanPassword,
                                    };
                                case 'shadowsocks':
                                    return {
                                        ...common,
                                        type: 'shadowsocks',
                                        password: userData.ssPassword,
                                        cipherType: 7,
                                        ivCheck: false,
                                    };
                                case 'shadowsocks22':
                                    return {
                                        ...common,
                                        type: 'shadowsocks22',
                                        password:
                                            inbound.password ??
                                            Buffer.from(userData.ssPassword).toString('base64'),
                                    };
                                case 'hysteria':
                                    return {
                                        ...common,
                                        type: 'hysteria',
                                        password: userData.vlessUuid,
                                    };
                                case 'masque':
                                    return {
                                        ...common,
                                        type: 'masque',
                                        password: userData.vlessUuid,
                                    };
                            }
                        }),
                    },
                    opts,
                ),
            );
        }
        return this.request<AddUsersCommand.Response>({
            label: 'ADD USERS',
            path: AddUsersCommand.url,
            opts,
            data,
            compress: true,
            timeout: 20_000,
        });
    }

    public async deleteUsers(
        data: RemoveUsersCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<RemoveUsersCommand.Response['response']>> {
        const version = await this.getNodeVersion(opts);
        if (!version.isOk) return version;
        if (!nodeSupportsBulkUsers(version.response)) {
            return this.legacyBulk(data.users, (user) =>
                this.deleteUser(
                    {
                        username: user.userId,
                        hashData: { vlessUuid: user.hashUuid },
                    },
                    opts,
                ),
            );
        }
        return this.request<RemoveUsersCommand.Response>({
            label: 'DELETE USERS',
            path: RemoveUsersCommand.url,
            opts,
            data,
            compress: true,
            internalError: true,
            timeout: 20_000,
        });
    }

    public async dropUsersConnections(
        data: DropUsersConnectionsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<DropUsersConnectionsCommand.Response['response']>> {
        return this.request<DropUsersConnectionsCommand.Response>({
            label: 'DROP USERS CONNECTIONS',
            path: DropUsersConnectionsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async dropIpsConnections(
        data: DropIpsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<DropIpsCommand.Response['response']>> {
        return this.request<DropIpsCommand.Response>({
            label: 'DROP IPS CONNECTIONS',
            path: DropIpsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async syncNodePlugins(
        data: SyncCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<SyncCommand.Response['response']>> {
        const version = await this.getNodeVersion(opts);
        if (!version.isOk) return version;
        if (!nodeSupportsPlugins(version.response)) {
            if (data.plugin === null) return ok({ accepted: true });
            return fail(
                ERRORS.NODE_ERROR_WITH_MSG.withMessage(
                    'This node does not support plugins; Remnawave 2.7.0 or Remnacust 1.1.1 is required',
                ),
            );
        }
        return this.request<SyncCommand.Response>({
            label: 'SYNC-NODE-PLUGINS',
            path: SyncCommand.url,
            opts,
            data,
            compress: true,
            logAxiosError: false,
            timeout: 10_000,
        });
    }

    public async collectTorrentBlockerReports(
        opts: INodeConnectionOpts,
    ): Promise<TResult<CollectReportsCommand.Response['response']>> {
        return this.request<CollectReportsCommand.Response>({
            label: 'COLLECT TORRENT BLOCKER REPORTS',
            path: CollectReportsCommand.url,
            opts,
            logAxiosError: false,
            timeout: 20_000,
        });
    }

    public async blockIps(
        data: BlockIpsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<BlockIpsCommand.Response['response']>> {
        return this.request<BlockIpsCommand.Response>({
            label: 'BLOCK IPS',
            path: BlockIpsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async unblockIps(
        data: UnblockIpsCommand.Request,
        opts: INodeConnectionOpts,
    ): Promise<TResult<UnblockIpsCommand.Response['response']>> {
        return this.request<UnblockIpsCommand.Response>({
            label: 'UNBLOCK IPS',
            path: UnblockIpsCommand.url,
            opts,
            data,
            timeout: 10_000,
        });
    }

    public async recreateTables(
        opts: INodeConnectionOpts,
    ): Promise<TResult<RecreateTablesCommand.Response['response']>> {
        return this.request<RecreateTablesCommand.Response>({
            label: 'RECREATE TABLES',
            path: RecreateTablesCommand.url,
            opts,
            timeout: 10_000,
        });
    }

    private failWithInternalError<T>(label: string, error: unknown): TResult<T> {
        if (error instanceof AxiosError) {
            this.logger.error(`Error in ${label}: ${error.code ?? 'HTTP'} ${error.message}`);
        } else {
            this.logger.error(`Error in ${label}: ${error}`);
        }

        return fail(ERRORS.INTERNAL_SERVER_ERROR);
    }

    private async legacyBulk<T>(
        items: readonly T[],
        action: (item: T) => Promise<TResult<{ success: boolean; error: string | null }>>,
    ): Promise<TResult<{ success: boolean; error: string | null }>> {
        for (let offset = 0; offset < items.length; offset += 8) {
            const results = await Promise.all(items.slice(offset, offset + 8).map(action));
            const failed = results.find((result) => !result.isOk || !result.response.success);
            if (failed) return failed;
        }
        return ok({ success: true, error: null });
    }

    private async compressData(data: unknown): Promise<{
        buffer: Buffer;
        size: number;
    }> {
        const buffer = Buffer.from(JSON.stringify(data));

        return {
            buffer: await zstdCompressAsync(buffer, {
                ...ZSTD_OPTIONS,
                pledgedSrcSize: buffer.length,
            }),
            size: buffer.length,
        };
    }
}

import axios, { AxiosError, AxiosInstance, RawAxiosResponseHeaders } from 'axios';
import { Agent as HttpAgent, type IncomingHttpHeaders } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { exit } from 'node:process';
import { table } from 'table';

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import {
    GetMetadataCommand,
    GetSubpageConfigByShortUuidCommand,
    GetSubscriptionInfoByShortUuidCommand,
    GetSubpageConfigCommand,
    GetSubpageConfigsCommand,
    GetUserByUsernameCommand,
    REMNAWAVE_REAL_IP_HEADER,
    TRequestTemplateTypeKeys,
} from '@remnawave/backend-contract';

import { TypedConfigService } from '@common/config/app-config';
import { IGNORED_HEADERS } from '@common/constants';
import { isCdnSelectorHeader } from '../utils/cdn-request-header';

import { ICommandResponse } from '../types/command-response.type';
import { subscriptionRequestHeaders } from './subscription-request-headers';
import type { SubscriptionDomainContext } from '../utils/subscription-domain-context';
import { publicGeofileOrigin } from '../utils/public-geofile-origin';

@Injectable()
export class AxiosService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AxiosService.name);
    private subpageVersion = __RW_SUBPAGE_VERSION__;
    private readonly privatePanelUrl: URL;
    private readonly publicDomains = new Map<string, { value: SubscriptionDomainContext; until: number }>();
    private readonly pendingDomains = new Map<string, Promise<SubscriptionDomainContext>>();

    public axiosInstance: AxiosInstance;
    private readonly httpAgent = new HttpAgent({
        keepAlive: true,
        maxSockets: 32,
        maxFreeSockets: 8,
        timeout: 10_000,
    });
    private readonly httpsAgent = new HttpsAgent({
        keepAlive: true,
        maxSockets: 32,
        maxFreeSockets: 8,
        timeout: 10_000,
    });

    constructor(private readonly configService: TypedConfigService) {
        this.privatePanelUrl = new URL(this.configService.getOrThrow('REMNAWAVE_PANEL_URL'));
        this.axiosInstance = axios.create({
            baseURL: this.configService.getOrThrow('REMNAWAVE_PANEL_URL'),
            timeout: 10_000,
            maxContentLength: 16 * 1024 * 1024,
            maxRedirects: 0,
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
            headers: {
                'user-agent': 'Remnawave Subscription Page',
                'x-subpage-version': this.subpageVersion,
                Authorization: `Bearer ${this.configService.getOrThrow('REMNAWAVE_API_TOKEN')}`,
            },
        });

        const caddyAuthApiToken = this.configService.get('CADDY_AUTH_API_TOKEN');

        const cloudflareZeroTrustClientId = this.configService.get(
            'CLOUDFLARE_ZERO_TRUST_CLIENT_ID',
        );
        const cloudflareZeroTrustClientSecret = this.configService.get(
            'CLOUDFLARE_ZERO_TRUST_CLIENT_SECRET',
        );

        const egamesCookie = this.configService.get('EGAMES_COOKIE');

        if (caddyAuthApiToken) {
            this.axiosInstance.defaults.headers.common['X-Api-Key'] = caddyAuthApiToken;
        }

        if (cloudflareZeroTrustClientId && cloudflareZeroTrustClientSecret) {
            this.axiosInstance.defaults.headers.common['CF-Access-Client-Id'] =
                cloudflareZeroTrustClientId;
            this.axiosInstance.defaults.headers.common['CF-Access-Client-Secret'] =
                cloudflareZeroTrustClientSecret;
        }

        if (this.configService.getOrThrow('REMNAWAVE_PANEL_URL').startsWith('http://')) {
            this.axiosInstance.defaults.headers.common['X-Forwarded-For'] = '127.0.0.1';
            this.axiosInstance.defaults.headers.common['X-Forwarded-Proto'] = 'https';
        }

        if (egamesCookie) {
            this.axiosInstance.defaults.headers.common['Cookie'] = egamesCookie;
        }
    }

    onModuleDestroy(): void {
        this.httpAgent.destroy();
        this.httpsAgent.destroy();
    }

    async onModuleInit(): Promise<void> {
        this.subpageVersion = __RW_SUBPAGE_VERSION__;

        this.logger.log('Private Remnawave upstream is configured.');

        const remnawaveMetadata = await this.getRemnawaveMetadata();
        if (!remnawaveMetadata.isOk || !remnawaveMetadata.remnawaveVersion) {
            this.logger.error(
                '\n' +
                    table([['Is the panel online and reachable from this server?']], {
                        header: {
                            content: `Connection to Remnawave Panel failed!`,
                            alignment: 'center',
                        },
                        columnDefault: {
                            width: 70,
                            alignment: 'center',
                            wrapWord: true,
                        },
                        drawVerticalLine: () => false,
                    }) +
                    '\n',
            );
            this.logger.error(remnawaveMetadata.error);

            exit(1);
        } else {
            this.logger.log(`[OK] Connected to Remnawave v${remnawaveMetadata.remnawaveVersion}`);
        }
    }

    public async getRemnawaveMetadata(): Promise<{
        isOk: boolean;
        remnawaveVersion?: string;
        error?: unknown;
    }> {
        try {
            const response = await this.axiosInstance.request<GetMetadataCommand.Response>({
                method: GetMetadataCommand.endpointDetails.REQUEST_METHOD,
                url: GetMetadataCommand.url,
            });

            await GetMetadataCommand.ResponseSchema.parseAsync(response.data);

            return {
                isOk: true,
                remnawaveVersion: response.data.response.version,
            };
        } catch (error) {
            if (error instanceof AxiosError) {
                return {
                    isOk: false,
                    error: error.message,
                };
            } else {
                return {
                    isOk: false,
                    error: error,
                };
            }
        }
    }

    public async getUserByUsername(
        clientIp: string,
        username: string,
    ): Promise<ICommandResponse<GetUserByUsernameCommand.Response>> {
        try {
            const response = await this.axiosInstance.request<GetUserByUsernameCommand.Response>({
                method: GetUserByUsernameCommand.endpointDetails.REQUEST_METHOD,
                url: GetUserByUsernameCommand.url(encodeURIComponent(username)),
                headers: {
                    [REMNAWAVE_REAL_IP_HEADER]: clientIp,
                },
            });

            return {
                isOk: true,
                response: response.data,
            };
        } catch (error) {
            if (error instanceof AxiosError) {
                this.logger.error('Error in Axios GetUserByUsername Request:', error.message);

                return {
                    isOk: false,
                };
            } else {
                this.logger.error('Unable to fetch subscription user');

                return {
                    isOk: false,
                };
            }
        }
    }

    public async getSubscriptionPageConfigByUuid(
        uuid: string,
    ): Promise<ICommandResponse<GetSubpageConfigCommand.Response['response']>> {
        try {
            const response = await this.axiosInstance.request<GetSubpageConfigCommand.Response>({
                method: GetSubpageConfigCommand.endpointDetails.REQUEST_METHOD,
                url: GetSubpageConfigCommand.url(encodeURIComponent(uuid)),
            });

            return {
                isOk: true,
                response: response.data.response,
            };
        } catch {
            this.logger.error('Unable to fetch subscription page configuration');

            return { isOk: false };
        }
    }

    public async getSubscriptionPageConfigList(): Promise<
        ICommandResponse<GetSubpageConfigsCommand.Response['response']>
    > {
        try {
            const response = await this.axiosInstance.request<GetSubpageConfigsCommand.Response>({
                method: GetSubpageConfigsCommand.endpointDetails.REQUEST_METHOD,
                url: GetSubpageConfigsCommand.url,
            });

            const validationResult = await GetSubpageConfigsCommand.ResponseSchema.parseAsync(
                response.data,
            );

            return {
                isOk: true,
                response: validationResult.response,
            };
        } catch (error) {
            if (error instanceof AxiosError) {
                if (error.response?.status === 404) {
                    this.logger.error('Request failed with 404 status code.');
                    this.logger.error(
                        'This version of Subscription Page requires Remnawave Panel version >=2.4.0. Please upgrade Remnawave Panel to the latest version or downgrade Subscription Page.',
                    );
                    return { isOk: false };
                }

                this.logger.error(`Subpage Config List Request failed: ${error.message}`);
                return { isOk: false };
            } else {
                this.logger.error('Unable to fetch subscription page configuration list');
                return { isOk: false };
            }
        }
    }

    public async getSubscriptionInfo(
        clientIp: string,
        shortUuid: string,
        signal?: AbortSignal,
    ): Promise<ICommandResponse<GetSubscriptionInfoByShortUuidCommand.Response>> {
        try {
            const response =
                await this.axiosInstance.request<GetSubscriptionInfoByShortUuidCommand.Response>({
                    method: GetSubscriptionInfoByShortUuidCommand.endpointDetails.REQUEST_METHOD,
                    signal,
                    url: GetSubscriptionInfoByShortUuidCommand.url(encodeURIComponent(shortUuid)),
                    headers: {
                        [REMNAWAVE_REAL_IP_HEADER]: clientIp,
                    },
                });

            return {
                isOk: true,
                response: response.data,
            };
        } catch (error) {
            if (error instanceof AxiosError) {
                this.logger.error('Error in GetSubscriptionInfo Request:', error.message);
            } else {
                this.logger.error('Unable to fetch subscription information');
            }

            return {
                isOk: false,
                status: axios.isAxiosError(error) ? error.response?.status : undefined,
            };
        }
    }

    public async getSubpageConfig(
        shortUuid: string,
        requestHeaders: IncomingHttpHeaders,
        signal?: AbortSignal,
    ): Promise<ICommandResponse<GetSubpageConfigByShortUuidCommand.Response['response']>> {
        try {
            const response =
                await this.axiosInstance.request<GetSubpageConfigByShortUuidCommand.Response>({
                    method: GetSubpageConfigByShortUuidCommand.endpointDetails.REQUEST_METHOD,
                    signal,
                    url: GetSubpageConfigByShortUuidCommand.url(encodeURIComponent(shortUuid)),
                    data: {
                        requestHeaders,
                    },
                });

            return {
                isOk: true,
                response: response.data.response,
            };
        } catch (error) {
            this.logger.error('Unable to fetch subscription page rules');
            return {
                isOk: false,
                status: axios.isAxiosError(error) ? error.response?.status : undefined,
            };
        }
    }

    public async resolveSubscriptionDomain(uuid: string): Promise<SubscriptionDomainContext> {
        if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(uuid))
            throw Object.assign(new Error('Subscription domain not found'), { status: 404 });
        const cached = this.publicDomains.get(uuid);
        if (cached && cached.until > Date.now()) return cached.value;
        const pending = this.pendingDomains.get(uuid);
        if (pending) return pending;
        if (this.pendingDomains.size >= 128)
            throw new Error('Subscription domain is temporarily unavailable');
        const request = this.axiosInstance.get(`api/sub/domains/${uuid}/resolve`, {
            params: { version: '2' },
            maxContentLength: 4096,
            headers: { 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity' },
        }).then(response => {
            const data = response.data?.response;
            if (data?.uuid !== uuid || typeof data.publicBaseUrl !== 'string' || data.publicBaseUrl.length > 600)
                throw new Error('Invalid subscription domain response');
            const url = new URL(data.publicBaseUrl);
            const legacySuffix = `/cdn/${uuid}`;
            const publicPath = (url.pathname.endsWith(legacySuffix)
                ? url.pathname.slice(0, -legacySuffix.length)
                : url.pathname).replace(/\/$/, '');
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
                publicGeofileOrigin(url.host) !== url.origin ||
                !/^(?:\/[A-Za-z0-9._~-]+)*$/.test(publicPath) ||
                publicPath.split('/').some(part => part === '.' || part === '..') ||
                this.containsPrivatePanelAddress(data.publicBaseUrl))
                throw new Error('Invalid subscription domain response');
            if (data.requestHeaderName !== undefined &&
                (typeof data.requestHeaderName !== 'string' || !/^X-[a-f0-9]{24}$/.test(data.requestHeaderName)))
                throw new Error('Invalid subscription domain response');
            const value = { uuid, publicBaseUrl: url.origin + publicPath,
                ...(data.requestHeaderName ? { requestHeaderName: data.requestHeaderName } : {}) };
            this.publicDomains.delete(uuid);
            this.publicDomains.set(uuid, { value, until: Date.now() + 5000 });
            if (this.publicDomains.size > 128) this.publicDomains.delete(this.publicDomains.keys().next().value!);
            return value;
        }).catch(error => {
            throw Object.assign(new Error('Subscription domain is unavailable'), {
                status: axios.isAxiosError(error) && error.response?.status === 404 ? 404 : 503,
            });
        }).finally(() => { this.pendingDomains.delete(uuid); });
        this.pendingDomains.set(uuid, request);
        return request;
    }

    public async getSubscription(
        clientIp: string,
        shortUuid: string,
        headers: NodeJS.Dict<string | string[]>,
        withClientType: boolean = false,
        clientType?: TRequestTemplateTypeKeys,
        signal?: AbortSignal,
        personalToken?: string,
        geofileOrigin?: string,
        domainUuid?: string,
    ): Promise<{
        subscription: Buffer;
        headers: RawAxiosResponseHeaders;
    } | null> {
        try {
            let basePath = 'api/sub/' + encodeURIComponent(shortUuid);

            if (personalToken) basePath += '/device/' + encodeURIComponent(personalToken);

            if (withClientType && clientType) {
                basePath += '/' + encodeURIComponent(clientType);
            }

            const response = await this.axiosInstance.request<Buffer>({
                method: 'GET',
                signal,
                timeout: 30_000,
                url: basePath,
                responseType: 'arraybuffer',
                headers: {
                    ...subscriptionRequestHeaders(headers),
                    'Accept-Encoding': undefined,
                    Accept: '*/*',
                    'Cache-Control': 'no-cache, no-store, must-revalidate, private, max-age=0',
                    Pragma: 'no-cache',
                    Expires: '0',
                    [REMNAWAVE_REAL_IP_HEADER]: clientIp,
                    Authorization: geofileOrigin || domainUuid
                        ? `Bearer ${this.configService.getOrThrow('REMNAWAVE_API_TOKEN')}`
                        : undefined,
                    'x-remnacust-geofile-origin': geofileOrigin,
                    'x-remnacust-subscription-domain': domainUuid,
                },
            });

            const responseHeaders = Object.fromEntries(
                Object.entries(response.headers).filter(
                    ([key, value]) =>
                        !IGNORED_HEADERS.has(key) && !isCdnSelectorHeader(key) &&
                        !this.containsPrivatePanelAddress(String(value)),
                ),
            );
            const subscription = Buffer.isBuffer(response.data)
                ? response.data
                : Buffer.from(response.data);
            if (this.containsPrivatePanelAddress(subscription.toString('utf8'))) {
                this.logger.error(
                    'Refused a subscription response containing the private panel address.',
                );
                throw new Error('PRIVATE_PANEL_ADDRESS_DISCLOSURE');
            }

            return {
                subscription,
                headers: responseHeaders,
            };
        } catch (error) {
            if (error instanceof AxiosError) {
                if (error.response) {
                    if (error.response.status === 404) {
                        return null;
                    }
                }

                this.logger.error(`Error in GetSubscription Request: ${error.message}`);
            } else {
                this.logger.error('Unable to fetch subscription');
            }

            throw new Error('UPSTREAM_SUBSCRIPTION_UNAVAILABLE');
        }
    }

    private containsPrivatePanelAddress(value: string): boolean {
        const normalized = value.toLowerCase();
        return (
            normalized.includes(this.privatePanelUrl.origin.toLowerCase()) ||
            normalized.includes(this.privatePanelUrl.host.toLowerCase())
        );
    }
}

import { filter, shuffle } from 'lodash';
import { customAlphabet } from 'nanoid';
import {
    GRPCConfig,
    HTTPUpgradeConfig,
    HysteriaConfig,
    InboundConfig,
    KCPConfig,
    SplitHTTPConfig,
    StreamSettingsConfig,
    TCPConfig,
    WebSocketConfig,
} from 'xray-typed';

import { Injectable } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import {
    resolveEncryptionFromDecryption,
    resolveInboundAndMlDsa65PublicKey,
    resolveInboundAndPublicKey,
} from '@common/helpers/xray-config';
import { getSsPassword, isSS2022MethodFromMethod } from '@common/helpers/xray-config/ss-cipher';
import { HostAccessService } from '@common/host-policy/host-access.service';
import { getVlessFlow } from '@common/utils/flow';
import { isTextRemark } from '@common/utils/templates/is-text-remark';
import { TemplateEngine } from '@common/utils/templates/replace-templates-values';
import { setVlessRouteForUuid } from '@common/utils/vless-route';
import { SECURITY_LAYERS, USERS_STATUS } from '@libs/contracts/constants';

import { ExternalSquadEntity } from '@modules/external-squads/entities';
import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { isHostTrafficLimited } from '@modules/hosts/utils/host-traffic-limit';
import { ISRRContext } from '@modules/subscription-response-rules/interfaces';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities/subscription-settings.entity';
import { composeStatusAndHwidRemarks } from '@modules/subscription/utils/compose-status-hwid-remarks';
import { registrationBlockedRemarks } from '@modules/subscription/utils/registration-blocked-remarks';
import { UserEntity } from '@modules/users/entities';

import {
    GrpcTransport,
    HttpUpgradeTransport,
    HysteriaTransport,
    KcpTransport,
    ProtocolVariant,
    ResolvedProxyConfig,
    SecurityVariant,
    TcpTransport,
    TransportVariant,
    WsTransport,
    XHttpTransport,
    XeraHttpTransport,
} from './interfaces';
import { override, toNonEmptyRecord } from './utils';

export interface IResolveProxyConfigOptions {
    subscriptionSettings: SubscriptionSettingsEntity | null;
    hosts: HostWithRawInbound[];
    user: UserEntity;
    hostsOverrides?: ExternalSquadEntity['hostOverrides'];
    fallbackOptions?: {
        showHwidMaxDeviceRemarks?: boolean;
        showHwidNotSupportedRemarks?: boolean;
        showHwidBlockedRemarks?: boolean;
        showHwidRegistrationBlockedRemarks?: boolean;
        respondWithRemarks?: string[];
    };
    excludeHostsByTags?: ISRRContext['excludeHostsByTags'];
}

@Injectable()
export class ResolveProxyConfigService {
    private readonly nanoid: ReturnType<typeof customAlphabet>;
    private readonly subPublicDomain: string;
    private readonly domainRegex =
        /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

    constructor(
        private readonly configService: TypedConfigService,
        private readonly hostAccess: HostAccessService,
    ) {
        this.nanoid = customAlphabet('0123456789abcdefghjkmnopqrstuvwxyz', 10);
        this.subPublicDomain = this.configService.getOrThrow('SUB_PUBLIC_DOMAIN');
    }

    public async resolveProxyConfig(
        options: IResolveProxyConfigOptions,
    ): Promise<ResolvedProxyConfig[]> {
        const { user, hostsOverrides, subscriptionSettings, fallbackOptions, excludeHostsByTags } =
            options;

        if (subscriptionSettings === null) {
            return [];
        }

        options.hosts = options.hosts.filter((host) => !isHostTrafficLimited(host));

        if (excludeHostsByTags) {
            options.hosts = options.hosts.filter(
                (h) => !h.tags.some((tag) => excludeHostsByTags.has(tag)),
            );
        }

        const subscriptionEnded =
            user.status === USERS_STATUS.EXPIRED ||
            user.status === USERS_STATUS.DISABLED ||
            (user.status === USERS_STATUS.ACTIVE && user.expireAt <= new Date());
        const inactive = user.status !== USERS_STATUS.ACTIVE || subscriptionEnded;
        const blocked = !!(
            fallbackOptions?.showHwidMaxDeviceRemarks ||
            fallbackOptions?.showHwidNotSupportedRemarks ||
            fallbackOptions?.showHwidBlockedRemarks ||
            fallbackOptions?.showHwidRegistrationBlockedRemarks ||
            fallbackOptions?.respondWithRemarks?.length
        );
        options.hosts = subscriptionEnded
            ? options.hosts.filter((host) => host.alwaysAvailable)
            : options.hosts.filter((host) => !host.onlyWhenInactive);

        const earlyRemarks = this.resolveEarlyExitRemarks(
            user,
            subscriptionSettings,
            fallbackOptions,
            options.hosts.length,
        );
        if (earlyRemarks !== null && (blocked || !inactive || options.hosts.length === 0)) {
            return this.createFallbackHosts(
                this.templateRemarks(earlyRemarks, user, subscriptionSettings, options.hosts),
            );
        }

        let hosts = this.applyShuffle(options.hosts);

        const hostUsers = await this.hostAccess.prepare(user, hosts);
        hosts = hosts.filter((host) => hostUsers.get(host.uuid) !== null);
        const rawInbounds = hosts.map((h) => h.rawInbound);
        const [publicKeyMap, mldsa65PublicKeyMap, encryptionMap] = await Promise.all([
            resolveInboundAndPublicKey(rawInbounds),
            resolveInboundAndMlDsa65PublicKey(rawInbounds),
            resolveEncryptionFromDecryption(rawInbounds),
        ]);

        const knownRemarks = new Map<string, number>();
        const resolvedProxyConfigs: ResolvedProxyConfig[] = [];

        for (const inputHost of hosts) {
            this.applyHostOverrides(inputHost, hostsOverrides);
            const userValueMap = TemplateEngine.createUserValueMap(
                user,
                subscriptionSettings,
                this.subPublicDomain,
                hosts,
                inputHost,
            );

            const finalRemark = this.deduplicateRemark(
                TemplateEngine.replace(inputHost.remark, userValueMap),
                knownRemarks,
            );

            const resolvedProxyConfig = this.buildResolvedProxyConfig({
                inputHost,
                inbound: inputHost.rawInbound as InboundConfig,
                finalRemark,
                user: hostUsers.get(inputHost.uuid) ?? user,
                publicKeyMap,
                mldsa65PublicKeyMap,
                encryptionMap,
            });

            if (resolvedProxyConfig) {
                resolvedProxyConfigs.push(resolvedProxyConfig);
            }
        }

        if (inactive && earlyRemarks?.length) {
            if (earlyRemarks.some((remark) => remark.trim() === '{{FREE_HOST}}')) {
                let inserted = false;
                return earlyRemarks.flatMap((remark) => {
                    if (remark.trim() === '{{FREE_HOST}}') {
                        if (inserted) return [];
                        inserted = true;
                        return resolvedProxyConfigs;
                    }
                    return this.createFallbackHosts(
                        this.templateRemarks([remark], user, subscriptionSettings, hosts),
                    );
                });
            }
            const remarks = this.createFallbackHosts(
                this.templateRemarks(earlyRemarks, user, subscriptionSettings, hosts),
            );
            return subscriptionSettings.customRemarks.alwaysAvailableHostsPosition === 'before'
                ? [...resolvedProxyConfigs, ...remarks]
                : [...remarks, ...resolvedProxyConfigs];
        }
        return resolvedProxyConfigs;
    }

    private withSpeedLimit(
        finalMask: Record<string, unknown> | null,
        speedLimitMbps: number | null,
    ): Record<string, unknown> | null {
        if (!speedLimitMbps || speedLimitMbps <= 0) return finalMask;
        const brutal = { brutalUp: `${speedLimitMbps} Mbps`, brutalDown: `${speedLimitMbps} Mbps` };
        const base = finalMask ?? {};
        return {
            ...base,
            quicParams: {
                ...(base.quicParams as Record<string, unknown> | undefined),
                ...brutal,
            },
        };
    }

    private resolveEarlyExitRemarks(
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
        fallbackOptions: IResolveProxyConfigOptions['fallbackOptions'],
        hostCount: number,
    ): string[] | null {
        if (fallbackOptions?.showHwidRegistrationBlockedRemarks) {
            return registrationBlockedRemarks(user, settings);
        }
        const status =
            user.status === USERS_STATUS.DISABLED
                ? 'DISABLED'
                : user.status === USERS_STATUS.EXPIRED || user.expireAt <= new Date()
                  ? 'EXPIRED'
                  : null;
        const statusRemarks = settings.isShowCustomRemarks
            ? status === 'DISABLED'
                ? settings.customRemarks.disabledUsers
                : status === 'EXPIRED'
                  ? settings.customRemarks.expiredUsers
                  : user.status === USERS_STATUS.LIMITED
                    ? settings.customRemarks.limitedUsers
                    : []
            : [];
        const effectiveStatusRemarks =
            status === 'DISABLED' &&
            settings.isShowCustomRemarks &&
            !statusRemarks.some((remark) => remark.trim())
                ? ['User is disabled']
                : statusRemarks;

        if (user.status === USERS_STATUS.LIMITED && statusRemarks.some((remark) => remark.trim())) {
            return statusRemarks;
        }

        const hwidRemarks = fallbackOptions?.showHwidBlockedRemarks
            ? (settings.customRemarks.HWIDBlocked ?? []).filter((remark) => {
                  const value = remark.trim();
                  return isTextRemark(value);
              })
            : [];
        const combinedRemarks = composeStatusAndHwidRemarks(
            status,
            effectiveStatusRemarks,
            hwidRemarks.length
                ? hwidRemarks
                : fallbackOptions?.showHwidBlockedRemarks
                  ? ['Device is blocked']
                  : [],
            settings.customRemarks,
        );
        if (combinedRemarks.some((remark) => remark.trim())) return combinedRemarks;

        if (status === 'DISABLED' && settings.isShowCustomRemarks) return ['User is disabled'];

        if (fallbackOptions?.showHwidBlockedRemarks) {
            return ['Device is blocked'];
        }

        if (settings.isShowCustomRemarks) {
            if (fallbackOptions) {
                if (fallbackOptions.showHwidMaxDeviceRemarks) {
                    return settings.customRemarks.HWIDMaxDevicesExceeded;
                }
                if (fallbackOptions.showHwidNotSupportedRemarks) {
                    return settings.customRemarks.HWIDNotSupported;
                }
                if (
                    fallbackOptions.respondWithRemarks &&
                    fallbackOptions.respondWithRemarks.length > 0
                ) {
                    return fallbackOptions.respondWithRemarks;
                }
            }
        }

        if (user.status === USERS_STATUS.DISABLED && hostCount === 0) {
            return ['User is disabled'];
        }

        if (hostCount === 0) {
            return settings.customRemarks.emptyHosts;
        }

        return null;
    }

    private resolveTransport(
        streamSettings: StreamSettingsConfig | undefined,
        inputHost: HostWithRawInbound,
        protocol: ProtocolVariant,
        authOptions: {
            vlessUuid: string;
        },
    ): TransportVariant {
        const rawNetwork = (
            (streamSettings as { method?: string } | undefined)?.method ?? streamSettings?.network
        )?.toLowerCase();

        if (rawNetwork === undefined || !streamSettings) {
            return {
                transport: 'tcp',
                transportOptions: {
                    header: null,
                },
            };
        }

        switch (rawNetwork) {
            case 'masque': {
                const settings = structuredClone(streamSettings.masqueSettings ?? {});
                if (inputHost.path != null) settings.path = inputHost.path;
                if (inputHost.host != null)
                    settings.host = this.resolveRandomizedValue(inputHost.host);
                if (protocol.protocol === 'masque') {
                    settings.user = protocol.protocolOptions.username;
                    settings.pass = protocol.protocolOptions.password;
                    for (const key of Object.keys(settings.headers ?? {})) {
                        if (key.toLowerCase() === 'authorization') delete settings.headers![key];
                    }
                }
                return { transport: 'masque', transportOptions: { settings } };
            }
            case 'xdrive':
                return {
                    transport: 'xdrive',
                    transportOptions: {
                        settings: structuredClone(streamSettings.xdriveSettings ?? {}),
                    },
                };
            case 'xera':
            case 'xera-http':
                return this.resolveXeraHttp(
                    (streamSettings as unknown as { xeraHttpSettings?: Record<string, unknown> })
                        .xeraHttpSettings,
                    inputHost,
                );
            case 'splithttp':
            case 'xhttp':
                return this.resolveXhttp(streamSettings.xhttpSettings, inputHost);
            case 'websocket':
            case 'ws':
                return this.resolveWs(streamSettings.wsSettings, inputHost);
            case 'httpupgrade':
                return this.resolveHttpUpgrade(streamSettings.httpupgradeSettings, inputHost);
            case 'grpc':
                return this.resolveGrpc(streamSettings.grpcSettings, inputHost);
            case 'raw':
                return this.resolveTcp(streamSettings.rawSettings, inputHost);
            case 'tcp':
                return this.resolveTcp(streamSettings.tcpSettings, inputHost);
            case 'mkcp':
            case 'kcp':
                return this.resolveKcp(streamSettings.kcpSettings);
            case 'hysteria':
                return this.resolveHysteria(
                    streamSettings.hysteriaSettings,
                    authOptions.vlessUuid,
                    protocol,
                    inputHost.vlessRouteId,
                );
            default:
                return {
                    transport: 'tcp',
                    transportOptions: {
                        header: null,
                    },
                };
        }
    }

    private resolveXeraHttp(
        settings: Record<string, unknown> | undefined,
        inputHost: HostWithRawInbound,
    ): XeraHttpTransport {
        const result = structuredClone(settings ?? {});
        delete result.serverMaxBufferedBytes;
        delete result.serverMaxSessions;
        if (inputHost.path !== null) result.path = inputHost.path;
        if (inputHost.host !== null) result.host = this.resolveRandomizedValue(inputHost.host);
        return { transport: 'xera-http', transportOptions: { settings: result } };
    }

    private resolveXhttp(
        settings: SplitHTTPConfig | undefined,
        inputHost: HostWithRawInbound,
    ): XHttpTransport {
        return {
            transport: 'xhttp',
            transportOptions: {
                path: override(inputHost.path, settings?.path),
                host: this.resolveRandomizedValue(override(inputHost.host, settings?.host) ?? ''),
                mode: settings?.mode ?? 'auto',
                extra: override(toNonEmptyRecord(inputHost.xhttpExtraParams), settings?.extra),
            },
        };
    }

    private resolveWs(
        settings: WebSocketConfig | undefined,
        inputHost: HostWithRawInbound,
    ): WsTransport {
        return {
            transport: 'ws',
            transportOptions: {
                host: this.resolveRandomizedValue(override(inputHost.host, settings?.host) ?? ''),
                path: override(inputHost.path, settings?.path),
                headers: settings?.headers ?? null,
                heartbeatPeriod: settings?.heartbeatPeriod ?? null,
            },
        };
    }

    private resolveHttpUpgrade(
        settings: HTTPUpgradeConfig | undefined,
        inputHost: HostWithRawInbound,
    ): HttpUpgradeTransport {
        return {
            transport: 'httpupgrade',
            transportOptions: {
                path: override(inputHost.path, settings?.path),
                host: this.resolveRandomizedValue(override(inputHost.host, settings?.host) ?? ''),
                headers: settings?.headers ?? null,
            },
        };
    }

    private resolveGrpc(
        settings: GRPCConfig | undefined,
        inputHost: HostWithRawInbound,
    ): GrpcTransport {
        return {
            transport: 'grpc',
            transportOptions: {
                authority: this.resolveRandomizedValue(
                    override(inputHost.host, settings?.authority) ?? '',
                ),
                serviceName: override(inputHost.path, settings?.serviceName),
                multiMode: !!settings?.multiMode,
            },
        };
    }

    private resolveTcp(
        settings: TCPConfig | undefined,
        inputHost: HostWithRawInbound,
    ): TcpTransport {
        if (settings && settings.header && settings.header.type === 'http') {
            let baseRequest = structuredClone(settings.header.request);
            if (!baseRequest) {
                baseRequest = {
                    version: '1.1',
                    method: 'GET',
                    headers: {
                        'Accept-Encoding': ['gzip', 'deflate'],
                        Connection: ['keep-alive'],
                        Pragma: ['no-cache'],
                    },
                };
            } else {
                baseRequest.headers = baseRequest.headers || {};

                if (inputHost.host) {
                    baseRequest.headers.Host = [this.resolveRandomizedValue(inputHost.host)];
                }

                if (inputHost.path) {
                    baseRequest.path = [inputHost.path];
                }
            }

            return {
                transport: 'tcp',
                transportOptions: {
                    header: {
                        type: 'http',
                        request: baseRequest,
                    },
                },
            };
        }

        return {
            transport: 'tcp',
            transportOptions: {
                header: settings?.header ?? null,
            },
        };
    }

    private resolveKcp(settings: KCPConfig | undefined): KcpTransport {
        return {
            transport: 'kcp',
            transportOptions: {
                clientMtu: settings?.clientMtu || settings?.mtu || 1350,
                clientTti: settings?.clientTti || settings?.tti || 50,
                congestion: settings?.congestion || false,
            },
        };
    }

    private resolveHysteria(
        settings: HysteriaConfig | undefined,
        vlessUuid: string,
        protocol: ProtocolVariant,
        vlessRouteId: number | null,
    ): HysteriaTransport {
        let auth: string = '';
        if (protocol.protocol === 'hysteria') {
            auth = setVlessRouteForUuid(vlessUuid, vlessRouteId);
        } else if (settings?.auth) {
            auth = settings.auth;
        }

        return {
            transport: 'hysteria',
            transportOptions: {
                version: 2,
                auth,
            },
        };
    }

    private resolveSecurity(
        streamSettings: StreamSettingsConfig | undefined,
        inputHost: HostWithRawInbound,
        inboundTag: string,
        publicKeyMap: Map<string, string>,
        mldsa65Map: Map<string, string>,
        resolvedAddress: string,
    ): SecurityVariant {
        if (!streamSettings) {
            return {
                security: 'none',
            };
        }

        let effectiveSecurity = streamSettings.security;
        if (inputHost.securityLayer !== SECURITY_LAYERS.DEFAULT) {
            switch (inputHost.securityLayer) {
                case SECURITY_LAYERS.TLS:
                    effectiveSecurity = 'tls';
                    break;
                case SECURITY_LAYERS.NONE:
                    effectiveSecurity = 'none';
                    break;
            }
        }

        switch (effectiveSecurity) {
            case 'tls': {
                const tls = streamSettings.tlsSettings;
                const alpn =
                    override(
                        inputHost.alpn,
                        Array.isArray(tls?.alpn) ? tls.alpn.join(',') : tls?.alpn,
                    ) ?? '';

                return {
                    security: 'tls',
                    securityOptions: {
                        alpn,
                        enableSessionResumption: !!tls?.enableSessionResumption,
                        fingerprint: override(inputHost.fingerprint, tls?.fingerprint) ?? 'chrome',
                        serverName: this.resolveFinalServerName(
                            inputHost,
                            streamSettings.tlsSettings?.serverName,
                            resolvedAddress,
                        ),
                        echConfigList: tls?.echConfigList || null,
                        echForceQuery: tls?.echForceQuery || null,
                        echSockopt: toNonEmptyRecord(tls?.echSockopt),
                        pinnedPeerCertSha256: inputHost.pinnedPeerCertSha256,
                        verifyPeerCertByName: inputHost.verifyPeerCertByName,
                        cipherSuites: tls?.cipherSuites || null,
                    },
                };
            }
            case 'reality': {
                const reality = streamSettings.realitySettings;
                const shortIds = reality?.shortIds || [];
                const shortId = shortIds.length > 0 ? shortIds[0] : '';

                return {
                    security: 'reality',
                    securityOptions: {
                        fingerprint:
                            override(inputHost.fingerprint, reality?.fingerprint) ?? 'chrome',
                        publicKey: publicKeyMap.get(inboundTag) || '',
                        shortId,
                        serverName: this.resolveFinalServerName(
                            inputHost,
                            reality?.serverNames?.[0],
                            resolvedAddress,
                        ),
                        spiderX: reality?.spiderX || '',
                        mldsa65Verify: mldsa65Map.get(inboundTag) ?? null,
                    },
                };
            }
            case 'none':
                return { security: 'none' };
            default:
                return { security: 'none' };
        }
    }

    private resolveFinalServerName(
        inputHost: HostWithRawInbound,
        serverName: string | undefined,
        resolvedAddress: string,
    ): string {
        if (inputHost.keepSniBlank) {
            return '';
        }

        if (inputHost.overrideSniFromAddress) {
            return resolvedAddress;
        }

        let baseSni = serverName ?? '';

        if (inputHost.sni) {
            baseSni = inputHost.sni;
        }

        if (!baseSni && this.isDomain(inputHost.address)) {
            baseSni = inputHost.address;
        }

        return this.resolveRandomizedValue(baseSni);
    }

    private resolveProtocolOptions(
        inputHost: HostWithRawInbound,
        inbound: InboundConfig,
        user: UserEntity,
        encryption?: string,
    ): ProtocolVariant | null {
        if (!inbound.settings) {
            return null;
        }

        switch (inbound.protocol) {
            case 'vless':
                return {
                    protocol: 'vless',
                    protocolOptions: {
                        id: setVlessRouteForUuid(user.vlessUuid, inputHost.vlessRouteId),
                        encryption: encryption ?? 'none',
                        flow: getVlessFlow(inbound),
                    },
                };
            case 'trojan':
                return {
                    protocol: 'trojan',
                    protocolOptions: {
                        password: user.trojanPassword,
                    },
                };
            case 'shadowsocks':
                const settings = inbound.settings;

                let clientPassword = user.ssPassword;

                if (isSS2022MethodFromMethod(settings.method) && 'password' in settings) {
                    clientPassword = `${settings.password}:${getSsPassword(user.ssPassword, true, settings.method)}`;
                }

                return {
                    protocol: 'shadowsocks',
                    protocolOptions: {
                        method: settings.method || 'chacha20-ietf-poly1305',
                        password: clientPassword,
                        uot: settings.uot || false,
                        uotVersion: settings.uotVersion || 1,
                    },
                };
            case 'masque':
                return {
                    protocol: 'masque',
                    protocolOptions: {
                        username: user.xrayUsername ?? user.id.toString(),
                        password: user.vlessUuid,
                        remoteDNS: [],
                    },
                };
            case 'hysteria':
                return {
                    protocol: 'hysteria',
                    protocolOptions: {
                        version: 2,
                    },
                };
            default:
                return null;
        }
    }

    private buildResolvedProxyConfig(ctx: {
        inputHost: HostWithRawInbound;
        inbound: InboundConfig;
        finalRemark: string;
        user: UserEntity;
        publicKeyMap: Map<string, string>;
        mldsa65PublicKeyMap: Map<string, string>;
        encryptionMap: Map<string, string>;
    }): ResolvedProxyConfig | null {
        const { inputHost, inbound, finalRemark, user } = ctx;

        const address = this.resolveRandomizedValue(inputHost.address);

        const protocol = this.resolveProtocolOptions(
            inputHost,
            inbound,
            user,
            ctx.encryptionMap.get(inputHost.inboundTag),
        );

        if (!protocol) {
            return null;
        }

        const transport = this.resolveTransport(inbound.streamSettings, inputHost, protocol, {
            vlessUuid: user.vlessUuid,
        });

        const security = this.resolveSecurity(
            inbound.streamSettings,
            inputHost,
            inbound.tag!,
            ctx.publicKeyMap,
            ctx.mldsa65PublicKeyMap,
            address,
        );

        return {
            finalRemark: finalRemark,
            address: address,
            port: inputHost.port,
            streamOverrides: {
                finalMask: this.withSpeedLimit(
                    override(
                        toNonEmptyRecord(inputHost.finalMask),
                        toNonEmptyRecord(inbound.streamSettings?.finalmask),
                    ),
                    inputHost.speedLimitMbps,
                ),
                sockopt: toNonEmptyRecord(inputHost.sockoptParams),
            },
            mux: toNonEmptyRecord(inputHost.muxParams),
            clientOverrides: {
                shuffleHost: inputHost.shuffleHost,
                mihomoX25519: inputHost.mihomoX25519,
                mihomoIpVersion: inputHost.mihomoIpVersion,
                serverDescription: inputHost.serverDescription
                    ? Buffer.from(inputHost.serverDescription).toString('base64')
                    : null,
                xrayJsonTemplate: inputHost.xrayJsonTemplate,
                mapper: inputHost.mapper,
            },
            metadata: {
                uuid: inputHost.uuid,
                tags: inputHost.tags,
                excludeFromSubscriptionTypes: inputHost.excludeFromSubscriptionTypes,
                inboundTag: inputHost.inboundTag,
                configProfileUuid: inputHost.configProfileUuid,
                configProfileInboundUuid: inputHost.configProfileInboundUuid,
                isDisabled: inputHost.isDisabled,
                alwaysAvailable: inputHost.alwaysAvailable,
                isHidden: inputHost.isHidden,
                viewPosition: inputHost.viewPosition,
                remark: inputHost.remark,
                vlessRouteId: inputHost.vlessRouteId,
                rawInbound: inputHost.rawInbound,
                speedLimitMbps: inputHost.speedLimitMbps,
                domainRules: inputHost.domainRules as {
                    mode: 'OFF' | 'ALLOW_ONLY' | 'DENY';
                    domains: string[];
                } | null,
            },
            ...protocol,
            ...security,
            ...transport,
        } satisfies ResolvedProxyConfig;
    }

    private resolveRandomizedValue(value: string): string {
        if (!value) return value;

        if (value.includes(',')) {
            const parts = value.split(',');
            return parts[Math.floor(Math.random() * parts.length)].trim();
        }

        if (value.includes('*')) {
            return value.replace('*', this.nanoid()).trim();
        }

        return value;
    }

    private isDomain(str: string): boolean {
        return this.domainRegex.test(str);
    }

    private deduplicateRemark(remark: string, knownRemarks: Map<string, number>): string {
        const currentCount = knownRemarks.get(remark) || 0;
        knownRemarks.set(remark, currentCount + 1);

        if (currentCount === 0) {
            return remark;
        }

        const hasExistingSuffix = remark.includes('^~') && remark.endsWith('~^');
        const suffix = hasExistingSuffix ? currentCount : currentCount + 1;
        return `${remark} ^~${suffix}~^`;
    }

    private applyHostOverrides(
        host: HostWithRawInbound,
        overrides?: ExternalSquadEntity['hostOverrides'],
    ): void {
        if (!overrides) return;

        if (overrides.vlessRouteId !== undefined) {
            host.vlessRouteId = overrides.vlessRouteId;
        }
        if (overrides.serverDescription !== undefined) {
            host.serverDescription = overrides.serverDescription;
        }
    }

    private applyShuffle(hosts: HostWithRawInbound[]): HostWithRawInbound[] {
        if (!hosts.some((h) => h.shuffleHost)) {
            return hosts;
        }
        return [...shuffle(filter(hosts, 'shuffleHost')), ...filter(hosts, (h) => !h.shuffleHost)];
    }

    private templateRemarks(
        remarks: string[],
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
        hosts: HostWithRawInbound[] = [],
    ): string[] {
        const userValueMap = TemplateEngine.createUserValueMap(
            user,
            settings,
            this.subPublicDomain,
            hosts,
        );
        return remarks
            .filter((remark) => remark.trim() !== '{{FREE_HOST}}')
            .map((remark) => {
                try {
                    const action = JSON.parse(remark);
                    if (action.type === 'link')
                        return TemplateEngine.replace(
                            [action.text, action.buttonText].filter(Boolean).join(' · '),
                            userValueMap,
                        );
                } catch {
                    /* plain remark */
                }
                return TemplateEngine.replace(remark, userValueMap);
            });
    }

    private parseResolvedProxyConfigFromRemark(remark: string): ResolvedProxyConfig | null {
        if (!remark.startsWith('{"f')) {
            return null;
        }

        try {
            const parsed: unknown = JSON.parse(remark);

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return null;
            }

            return parsed as ResolvedProxyConfig;
        } catch {
            return null;
        }
    }

    private createFallbackHosts(remarks: string[]): ResolvedProxyConfig[] {
        return remarks.map(
            (remark) =>
                this.parseResolvedProxyConfigFromRemark(remark.trim()) ??
                ({
                    finalRemark: remark,
                    address: '0.0.0.0',
                    port: 1,
                    streamOverrides: {
                        finalMask: null,
                        sockopt: null,
                    },
                    mux: null,
                    protocol: 'vless',
                    protocolOptions: {
                        id: '00000000-0000-0000-0000-000000000000',
                        encryption: 'none',
                        flow: '',
                    },
                    transport: 'tcp',
                    transportOptions: {
                        header: null,
                    },
                    security: 'none',
                    clientOverrides: {
                        shuffleHost: false,
                        mihomoX25519: false,
                        serverDescription: null,
                        xrayJsonTemplate: null,
                        mihomoIpVersion: null,
                        mapper: {},
                    },
                    metadata: {
                        uuid: '00000000-0000-0000-0000-000000000000',
                        tags: [],
                        excludeFromSubscriptionTypes: [],
                        inboundTag: '',
                        configProfileUuid: null,
                        configProfileInboundUuid: null,
                        isDisabled: false,
                        isHidden: false,
                        viewPosition: 0,
                        remark: remark,
                        vlessRouteId: null,
                        rawInbound: null,
                        speedLimitMbps: null,
                        domainRules: null,
                    },
                } satisfies ResolvedProxyConfig),
        );
    }
}

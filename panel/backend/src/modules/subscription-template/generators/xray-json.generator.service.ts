import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyObject } from '@common/utils';
import { configuredRegex } from '@common/utils/bounded-regex';
import type { TInjectHostsEntry, TRemnawaveInjectorSelectFrom } from '@libs/contracts/models';

import { applyHostMapper } from '../host-mapper';
import { ResolvedProxyConfig } from '../resolve-proxy/interfaces';
import { SubscriptionTemplateService } from '../subscription-template.service';
import { ClientPoolError } from './client-pool';
import { selectInjectHosts } from './inject-host-selection';
import {
    IGenerateConfigParams,
    Outbound,
    StreamSettings,
    XrayJsonConfig,
} from './interfaces/xray-json-config.interface';
import { materializePriority } from './priority-failover';

type VlessConfig = Extract<ResolvedProxyConfig, { protocol: 'vless' }>;
type TrojanConfig = Extract<ResolvedProxyConfig, { protocol: 'trojan' }>;
type ShadowsocksConfig = Extract<ResolvedProxyConfig, { protocol: 'shadowsocks' }>;
type HysteriaConfig = Extract<ResolvedProxyConfig, { protocol: 'hysteria' }>;

type ProtocolBuilderMap = {
    vless: (host: VlessConfig) => object;
    trojan: (host: TrojanConfig) => object;
    shadowsocks: (host: ShadowsocksConfig) => object;
    hysteria: (host: HysteriaConfig) => object;
};

type WsConfig = Extract<ResolvedProxyConfig, { transport: 'ws' }>;
type HttpUpgradeConfig = Extract<ResolvedProxyConfig, { transport: 'httpupgrade' }>;
type TcpConfig = Extract<ResolvedProxyConfig, { transport: 'tcp' }>;
type XHttpConfig = Extract<ResolvedProxyConfig, { transport: 'xhttp' }>;
type GrpcConfig = Extract<ResolvedProxyConfig, { transport: 'grpc' }>;
type KcpConfig = Extract<ResolvedProxyConfig, { transport: 'kcp' }>;
type HysteriaTransportConfig = Extract<ResolvedProxyConfig, { transport: 'hysteria' }>;

type TransportBuilderMap = {
    hysteria: (host: HysteriaTransportConfig) => Record<string, unknown>;
    ws: (host: WsConfig) => Record<string, unknown>;
    httpupgrade: (host: HttpUpgradeConfig) => Record<string, unknown>;
    tcp: (host: TcpConfig) => Record<string, unknown>;
    xhttp: (host: XHttpConfig) => Record<string, unknown>;
    grpc: (host: GrpcConfig) => Record<string, unknown>;
    kcp: (host: KcpConfig) => Record<string, unknown>;
};
const PROTOCOL_BUILDERS: ProtocolBuilderMap = {
    vless: (host) => ({
        vnext: [
            {
                address: host.address,
                port: host.port,
                users: [
                    {
                        id: host.protocolOptions.id,
                        encryption: host.protocolOptions.encryption || 'none',
                        flow: host.protocolOptions.flow,
                    },
                ],
            },
        ],
    }),

    trojan: (host) => ({
        servers: [
            {
                address: host.address,
                port: host.port,
                password: host.protocolOptions.password,
            },
        ],
    }),
    hysteria: (host) => ({
        address: host.address,
        port: host.port,
        version: 2,
    }),

    shadowsocks: (host) => ({
        servers: [
            {
                address: host.address,
                port: host.port,
                password: host.protocolOptions.password,
                method: host.protocolOptions.method,
                uot: host.protocolOptions.uot,
                UoTVersion: host.protocolOptions.uotVersion,
            },
        ],
    }),
};

const TRANSPORT_BUILDERS: TransportBuilderMap = {
    ws: (host) => ({
        path: host.transportOptions.path,
        host: host.transportOptions.host,
        headers: { ...host.transportOptions.headers },
        ...(host.transportOptions.heartbeatPeriod != null && {
            heartbeatPeriod: host.transportOptions.heartbeatPeriod,
        }),
    }),
    httpupgrade: (host) => ({
        path: host.transportOptions.path,
        host: host.transportOptions.host,
        headers: { ...host.transportOptions.headers },
    }),
    tcp: buildTcpSettings,
    xhttp: (host) => ({
        mode: host.transportOptions.mode,
        host: host.transportOptions.host,
        ...(host.transportOptions.path && { path: host.transportOptions.path }),
        ...(host.transportOptions.extra && { extra: host.transportOptions.extra }),
    }),
    grpc: (host) => ({
        serviceName: host.transportOptions.serviceName,
        authority: host.transportOptions.authority,
        multiMode: !!host.transportOptions.multiMode,
    }),
    kcp: (host) => ({
        mtu: host.transportOptions.clientMtu,
        tti: host.transportOptions.clientTti,
        congestion: host.transportOptions.congestion,
    }),
    hysteria: (host) => ({
        version: 2,
        auth: host.transportOptions.auth,
    }),
};

function buildTcpSettings(host: ResolvedProxyConfig): Record<string, unknown> {
    if (host.transport !== 'tcp' || !host.transportOptions.header) return {};

    return {
        header: host.transportOptions.header,
    };
}

function buildTlsSettings(host: ResolvedProxyConfig): Record<string, unknown> {
    if (host.security !== 'tls') return {};
    const settings: Record<string, unknown> = {
        serverName: host.securityOptions.serverName || '',
        enableSessionResumption: host.securityOptions.enableSessionResumption,
    };

    if (host.securityOptions.fingerprint !== '') {
        settings.fingerprint = host.securityOptions.fingerprint;
    }

    if (host.securityOptions.alpn) {
        settings.alpn = host.securityOptions.alpn.split(',');
    }

    if (host.securityOptions.pinnedPeerCertSha256) {
        settings.pinnedPeerCertSha256 = host.securityOptions.pinnedPeerCertSha256;
    }

    if (host.securityOptions.verifyPeerCertByName) {
        settings.verifyPeerCertByName = host.securityOptions.verifyPeerCertByName;
    }

    if (host.securityOptions.echForceQuery) {
        settings.echForceQuery = host.securityOptions.echForceQuery;
    }

    if (host.securityOptions.echConfigList) {
        settings.echConfigList = host.securityOptions.echConfigList;
    }

    if (host.securityOptions.echSockopt) {
        settings.echSockopt = host.securityOptions.echSockopt;
    }

    if (host.securityOptions.cipherSuites) {
        settings.cipherSuites = host.securityOptions.cipherSuites;
    }

    return settings;
}

function buildRealitySettings(host: ResolvedProxyConfig): Record<string, unknown> {
    if (host.security !== 'reality') return {};
    const settings: Record<string, unknown> = {
        serverName: host.securityOptions.serverName,
    };

    if (host.securityOptions.publicKey) settings.publicKey = host.securityOptions.publicKey;
    if (host.securityOptions.mldsa65Verify)
        settings.mldsa65Verify = host.securityOptions.mldsa65Verify;
    if (host.securityOptions.shortId) settings.shortId = host.securityOptions.shortId;
    if (host.securityOptions.spiderX) settings.spiderX = host.securityOptions.spiderX;
    if (host.securityOptions.fingerprint !== '')
        settings.fingerprint = host.securityOptions.fingerprint;

    return settings;
}

@Injectable()
export class XrayJsonGeneratorService {
    private readonly logger = new Logger(XrayJsonGeneratorService.name);

    constructor(private readonly subscriptionTemplateService: SubscriptionTemplateService) {}

    public async generateConfig(params: IGenerateConfigParams): Promise<string> {
        const {
            hosts,
            isExtendedClient,
            overrideTemplateName,
            ignoreHostXrayJsonTemplate = false,
        } = params;

        try {
            const templateContent = (await this.subscriptionTemplateService.getCachedTemplateByType(
                'XRAY_JSON',
                overrideTemplateName,
                params.geofileDelivery,
            )) as unknown as XrayJsonConfig;

            const configs: string[] = [];
            let outputBytes = 2;
            const append = (config: XrayJsonConfig) => {
                const serialized = JSON.stringify(materializePriority(config));
                outputBytes += Buffer.byteLength(serialized) + (configs.length ? 1 : 0);
                if (outputBytes > 16 * 1024 * 1024)
                    throw new ClientPoolError('subscription-size-limit');
                configs.push(serialized);
            };
            const regexDeadline = Date.now() + 1000;

            for (const host of hosts) {
                if (host.metadata.isHidden) continue;
                if (host.metadata.excludeFromSubscriptionTypes.includes('XRAY_JSON')) continue;

                const selectedTemplate = ignoreHostXrayJsonTemplate
                    ? templateContent
                    : ((host.clientOverrides.xrayJsonTemplate as XrayJsonConfig) ??
                      templateContent);
                const baseTemplate =
                    selectedTemplate === templateContent || !('remnacust' in selectedTemplate)
                        ? selectedTemplate
                        : ((await this.subscriptionTemplateService.prepareClientTemplate(
                              selectedTemplate as unknown as Record<string, unknown>,
                              'XRAY_JSON',
                              params.geofileDelivery,
                          )) as unknown as XrayJsonConfig);

                if (
                    baseTemplate.remnawave &&
                    (baseTemplate.remnawave.injectHosts !== undefined ||
                        baseTemplate.remnawave.addVirtualHostAsOutbound)
                ) {
                    const injected = await this.applyRemnawaveInjector(
                        baseTemplate,
                        host,
                        hosts,
                        isExtendedClient,
                        regexDeadline,
                    );
                    if (injected) append(injected);
                    continue;
                }

                const outboundConfig = this.buildOutboundConfig(host, isExtendedClient);
                if (!outboundConfig) continue;

                const templateOutbounds = [...(baseTemplate.outbounds ?? [])];
                const routing = this.buildDomainRulesRouting(
                    host,
                    templateOutbounds,
                    baseTemplate.routing,
                );

                const { remnawave: _injector, ...clientTemplate } = baseTemplate;
                append({
                    ...clientTemplate,
                    outbounds: [...outboundConfig.outbounds, ...templateOutbounds],
                    ...(routing ? { routing } : {}),
                    remarks: outboundConfig.remarks,
                    meta: outboundConfig.meta,
                });
            }

            return `[${configs.join(',')}]`;
        } catch (error) {
            if (error instanceof ClientPoolError) throw error;
            this.logger.error(`Error generating xray-json config: ${error}`);
            return '';
        }
    }

    private buildDomainRulesRouting(
        host: ResolvedProxyConfig,
        templateOutbounds: Outbound[],
        templateRouting: XrayJsonConfig['routing'],
    ): object | undefined {
        const rules = host.metadata.domainRules;
        if (
            !rules ||
            rules.mode === 'OFF' ||
            !Array.isArray(rules.domains) ||
            rules.domains.length === 0
        ) {
            return undefined;
        }
        const domains = rules.domains.filter(
            (domain): domain is string => typeof domain === 'string' && domain.trim().length > 0,
        );
        if (domains.length === 0) return undefined;

        let blockTag = 'block';
        while (
            templateOutbounds.some(
                (outbound) => outbound.tag === blockTag && outbound.protocol !== 'blackhole',
            )
        )
            blockTag = `_${blockTag}`;
        if (!templateOutbounds.some((outbound) => outbound.tag === blockTag))
            templateOutbounds.push({ tag: blockTag, protocol: 'blackhole' } as Outbound);
        if (rules.mode === 'DENY') {
            return {
                domainStrategy: 'IPIfNonMatch',
                ...templateRouting,
                // Host restrictions take priority; unrelated template/geofile routing remains effective.
                rules: [
                    { domain: domains, outboundTag: blockTag },
                    ...(templateRouting?.rules ?? []),
                ],
            };
        }
        return {
            ...templateRouting,
            domainStrategy: 'IPIfNonMatch',
            // ALLOW_ONLY is a restrictive override; appending manual rules could bypass its deny rule.
            rules: [
                { domain: domains, outboundTag: 'proxy' },
                { network: 'tcp,udp', outboundTag: blockTag },
            ],
        };
    }

    private buildOutboundConfig(
        host: ResolvedProxyConfig,
        isExtendedClient: boolean,
        tag = 'proxy',
    ): XrayJsonConfig | null {
        try {
            const outbound = this.buildOutbound(host, tag);

            const config: XrayJsonConfig = {
                remarks: host.finalRemark,
                outbounds: [outbound],
            };

            if (isExtendedClient) {
                config.meta = {
                    alwaysAvailable: host.metadata.alwaysAvailable === true,
                    isRemark: host.metadata.uuid === '00000000-0000-0000-0000-000000000000',
                    serverDescription: Buffer.from(
                        host.clientOverrides.serverDescription ?? '',
                        'base64',
                    ).toString(),
                };
            }

            return config;
        } catch (error) {
            this.logger.error(`Error creating config for host: ${error}`);
            return null;
        }
    }

    private buildOutbound(host: ResolvedProxyConfig, tag: string): Outbound {
        const outbound: Outbound = {
            tag,
            protocol: host.protocol,
            settings: this.buildProtocolSettings(host),
            streamSettings: this.buildStreamSettings(host),
        };

        if (host.protocol !== 'masque' && isNonEmptyObject(host.mux)) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { smux: _, ...mux } = host.mux;
            if (Object.keys(mux).length > 0) {
                outbound.mux = mux;
            }
        }

        return applyHostMapper(outbound, host.clientOverrides.mapper.xrayJson, host);
    }

    private buildTransportEntry(host: ResolvedProxyConfig): object {
        switch (host.transport) {
            case 'ws':
                return { wsSettings: TRANSPORT_BUILDERS.ws(host) };
            case 'httpupgrade':
                return { httpupgradeSettings: TRANSPORT_BUILDERS.httpupgrade(host) };
            case 'tcp':
                return { tcpSettings: TRANSPORT_BUILDERS.tcp(host) };
            case 'masque':
                return { masqueSettings: structuredClone(host.transportOptions.settings) };
            case 'xdrive':
                return { xdriveSettings: structuredClone(host.transportOptions.settings) };
            case 'xera-http':
                return { xeraHttpSettings: structuredClone(host.transportOptions.settings) };
            case 'xhttp':
                return { xhttpSettings: TRANSPORT_BUILDERS.xhttp(host) };
            case 'grpc':
                return { grpcSettings: TRANSPORT_BUILDERS.grpc(host) };
            case 'kcp':
                return { kcpSettings: TRANSPORT_BUILDERS.kcp(host) };
            case 'hysteria':
                return { hysteriaSettings: TRANSPORT_BUILDERS.hysteria(host) };
        }
    }

    private buildProtocolSettings(host: ResolvedProxyConfig): object {
        switch (host.protocol) {
            case 'masque':
                return {
                    address: host.address,
                    port: host.port,
                    remoteDNS: host.protocolOptions.remoteDNS,
                };
            case 'vless':
                return PROTOCOL_BUILDERS.vless(host);
            case 'trojan':
                return PROTOCOL_BUILDERS.trojan(host);
            case 'shadowsocks':
                return PROTOCOL_BUILDERS.shadowsocks(host);
            case 'hysteria':
                return PROTOCOL_BUILDERS.hysteria(host);
        }
    }

    private buildSecurityEntry(host: ResolvedProxyConfig): object {
        switch (host.security) {
            case 'tls':
                return {
                    security: 'tls',
                    tlsSettings: buildTlsSettings(host),
                };
            case 'reality':
                return {
                    security: 'reality',
                    realitySettings: buildRealitySettings(host),
                };
            case 'none':
                return { security: 'none' };
            default:
                return {};
        }
    }

    private buildStreamSettings(host: ResolvedProxyConfig): StreamSettings {
        return {
            network: host.transport,
            ...this.buildTransportEntry(host),
            ...this.buildSecurityEntry(host),
            ...(host.streamOverrides.sockopt && { sockopt: host.streamOverrides.sockopt }),
            ...(host.streamOverrides.finalMask && { finalmask: host.streamOverrides.finalMask }),
        };
    }

    private buildTaggedOutbounds(
        hosts: ResolvedProxyConfig[],
        {
            tagPrefix,
            useHostRemarkAsTag,
            useHostTagAsTag,
        }: { tagPrefix?: string; useHostRemarkAsTag?: boolean; useHostTagAsTag?: boolean },
    ): Outbound[] {
        if (useHostRemarkAsTag) {
            return hosts.map((h) => this.buildOutbound(h, h.finalRemark));
        }

        if (useHostTagAsTag) {
            return hosts.map((h) => this.buildOutbound(h, h.metadata.tags[0] || h.finalRemark));
        }

        const proxyTag = tagPrefix ?? 'proxy';
        return hosts.map((h, i) =>
            this.buildOutbound(h, i === 0 ? proxyTag : `${proxyTag}-${i + 1}`),
        );
    }

    private async resolveHosts(
        entry: TInjectHostsEntry,
        selectFrom: TRemnawaveInjectorSelectFrom,
        host: ResolvedProxyConfig,
        allHosts: ResolvedProxyConfig[],
        deadline: number,
    ): Promise<ResolvedProxyConfig[]> {
        const selector = entry.selector;
        const source = selectFrom ?? 'HIDDEN';
        // A pool must obey the same host restrictions as standalone profiles.
        allHosts = allHosts.filter(
            (candidate) =>
                !candidate.metadata.isDisabled &&
                !candidate.metadata.excludeFromSubscriptionTypes?.includes('XRAY_JSON'),
        );
        const recipientUuid = host.metadata.uuid;
        let candidates: ResolvedProxyConfig[] = [];
        switch (source) {
            case 'ALL':
                candidates = allHosts.filter((h) => h.metadata.uuid !== recipientUuid);
                break;
            case 'HIDDEN':
                candidates = allHosts.filter(
                    (h) => h.metadata.isHidden && h.metadata.uuid !== recipientUuid,
                );
                break;
            case 'NOT_HIDDEN':
                candidates = allHosts.filter(
                    (h) => !h.metadata.isHidden && h.metadata.uuid !== recipientUuid,
                );
                break;
        }

        switch (selector.type) {
            case 'uuids':
            case 'tags':
                return selectInjectHosts(entry, candidates);

            case 'remarkRegex': {
                const selected: ResolvedProxyConfig[] = [];
                for (const candidate of candidates) {
                    if (
                        await configuredRegex.test(
                            selector.pattern,
                            candidate.finalRemark,
                            '',
                            deadline,
                        )
                    )
                        selected.push(candidate);
                }
                return selectInjectHosts(entry, selected);
            }

            case 'sameTagAsRecipient':
                return selectInjectHosts(
                    entry,
                    candidates.filter(
                        (h) =>
                            h.metadata.tags.length > 0 &&
                            host.metadata.tags.length > 0 &&
                            h.metadata.tags.some((t) => host.metadata.tags.includes(t)),
                    ),
                );

            case 'tagRegex': {
                const selected: ResolvedProxyConfig[] = [];
                for (const candidate of candidates) {
                    for (const tag of candidate.metadata.tags) {
                        if (await configuredRegex.test(selector.pattern, tag, '', deadline)) {
                            selected.push(candidate);
                            break;
                        }
                    }
                }
                return selectInjectHosts(entry, selected);
            }
        }
    }

    private async applyRemnawaveInjector(
        baseTemplate: XrayJsonConfig,
        host: ResolvedProxyConfig,
        allHosts: ResolvedProxyConfig[],
        isExtendedClient: boolean,
        deadline: number,
    ): Promise<XrayJsonConfig | null> {
        const { remnawave: injector, ...template } = baseTemplate;
        if (!injector) return null;
        if (!injector.injectHosts && !injector.addVirtualHostAsOutbound) return null;

        const injectedOutbounds = injector.addVirtualHostAsOutbound
            ? [this.buildOutbound(host, 'proxy')]
            : [];
        for (const entry of injector.injectHosts ?? []) {
            const selected = await this.resolveHosts(
                entry,
                entry.selectFrom,
                host,
                allHosts,
                deadline,
            );
            // A new bounded pool with no eligible member must not emit an invalid balancer
            // or silently fall back to the recipient's placeholder address.
            if (entry.mode && selected.length === 0) return null;
            injectedOutbounds.push(
                ...this.buildTaggedOutbounds(selected, {
                    tagPrefix: entry.tagPrefix,
                    useHostRemarkAsTag: entry.useHostRemarkAsTag,
                    useHostTagAsTag: entry.useHostTagAsTag,
                }),
            );
        }

        const config: XrayJsonConfig = {
            ...template,
            outbounds: [...injectedOutbounds, ...template.outbounds],
            remarks: host.finalRemark,
        };

        if (isExtendedClient) {
            config.meta = {
                alwaysAvailable: host.metadata.alwaysAvailable === true,
                isRemark: host.metadata.uuid === '00000000-0000-0000-0000-000000000000',
                serverDescription: Buffer.from(
                    host.clientOverrides.serverDescription ?? '',
                    'base64',
                ).toString(),
            };
        }

        return config;
    }
}

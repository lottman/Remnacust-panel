import { Injectable } from '@nestjs/common';

import { RawCacheService } from '@common/raw-cache';
import { USERS_STATUS } from '@libs/contracts/constants';

import { SUBSCRIPTION_CONFIG_TYPES } from './constants/config-types';
import { ClashGeneratorService } from './generators/clash.generator.service';
import { MihomoGeneratorService } from './generators/mihomo.generator.service';
import { SingBoxGeneratorService } from './generators/singbox.generator.service';
import { XrayJsonGeneratorService } from './generators/xray-json.generator.service';
import { XrayGeneratorService } from './generators/xray.generator.service';
import { automaticXrayDelivery } from './geofiles/automatic-xray-delivery';
import { stabilizeRoutingProfile } from './geofiles/stabilize-routing-profile';
import { xrayGeofileClient, XrayGeofileDelivery } from './geofiles/xray-geofile-delivery';
import { IGenerateSubscription } from './interfaces';
import { ResolvedProxyConfig } from './resolve-proxy/interfaces';
import {
    IResolveProxyConfigOptions,
    ResolveProxyConfigService,
} from './resolve-proxy/resolve-proxy-config.service';

@Injectable()
export class RenderTemplatesService {
    constructor(
        private readonly resolveProxyConfigService: ResolveProxyConfigService,
        private readonly mihomoGeneratorService: MihomoGeneratorService,
        private readonly clashGeneratorService: ClashGeneratorService,
        private readonly xrayGeneratorService: XrayGeneratorService,
        private readonly singBoxGeneratorService: SingBoxGeneratorService,
        private readonly xrayJsonGeneratorService: XrayJsonGeneratorService,
        private readonly rawCache: RawCacheService,
    ) {}

    public async generateSubscription(params: IGenerateSubscription): Promise<{
        contentType: string;
        subscription: string;
    }> {
        const { srrContext, user, hosts, hostsOverrides, fallbackOptions } = params;

        let formattedHosts = await this.resolveProxyConfigService.resolveProxyConfig({
            subscriptionSettings: srrContext.subscriptionSettings,
            hosts,
            user,
            hostsOverrides,
            fallbackOptions,
            excludeHostsByTags: srrContext.excludeHostsByTags,
            activeExpiryPlan: params.activeExpiryPlan,
        });
        if (params.onResolvedHosts) {
            params.onResolvedHosts(
                formattedHosts
                    .filter(
                        (host) =>
                            host.metadata.uuid !== '00000000-0000-0000-0000-000000000000' &&
                            !host.metadata.isDisabled &&
                            !host.metadata.excludeFromSubscriptionTypes.some(
                                (type) => type === srrContext.matchedResponseType,
                            ),
                    )
                    .map((host) => host.metadata.uuid),
            );
        }

        const configuredHeaders = {
            ...srrContext.subscriptionSettings?.customResponseHeaders,
            ...srrContext.headersToApply,
        };
        const hasRouting = Object.keys(configuredHeaders).some(
            (key) => key.toLowerCase() === 'routing',
        );
        const client = xrayGeofileClient(srrContext.userAgent ?? '');

        switch (srrContext.matchedResponseType) {
            case 'XRAY_BASE64': {
                const subscription = await this.xrayGeneratorService.generateConfig(
                    formattedHosts,
                    SUBSCRIPTION_CONFIG_TYPES['XRAY_BASE64'].isBase64,
                    srrContext.isExtendedClient,
                );
                if (client && !hasRouting && subscription)
                    await this.applyGeofileRouting(
                        params,
                        client,
                        configuredHeaders,
                        {
                            header: new XrayGeofileDelivery(
                                client,
                                'inline',
                                params.profileTitle ?? 'Subscription',
                            ).retirementHeader(
                                params.profileKey ?? String(user.id),
                                Date.now(),
                                true,
                            ),
                            intervalHours: 0,
                            inline: true,
                        },
                        true,
                    );
                return {
                    subscription,
                    contentType: SUBSCRIPTION_CONFIG_TYPES['XRAY_BASE64'].CONTENT_TYPE,
                };
            }

            case 'CLASH':
                return {
                    subscription: await this.clashGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
                        srrContext.subscriptionSettings.serveJsonAtBaseSubscription === true &&
                            srrContext.subscriptionSettings.geofilesSystemEnabled === true,
                        srrContext.subscriptionSettings.geofilesInlineRuleLimit,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['CLASH'].CONTENT_TYPE,
                };

            case 'MIHOMO':
                return {
                    subscription: await this.mihomoGeneratorService.generateConfig(
                        formattedHosts,
                        false,
                        srrContext.isExtendedClient,
                        srrContext.overrideTemplateName,
                        srrContext.subscriptionSettings.serveJsonAtBaseSubscription === true &&
                            srrContext.subscriptionSettings.geofilesSystemEnabled === true,
                        srrContext.subscriptionSettings.geofilesInlineRuleLimit,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['MIHOMO'].CONTENT_TYPE,
                };

            case 'SINGBOX':
                return {
                    subscription: await this.singBoxGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
                        srrContext.subscriptionSettings.serveJsonAtBaseSubscription === true &&
                            srrContext.subscriptionSettings.geofilesSystemEnabled === true,
                        srrContext.subscriptionSettings.geofilesInlineRuleLimit,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['SINGBOX'].CONTENT_TYPE,
                };

            case 'STASH':
                return {
                    subscription: await this.mihomoGeneratorService.generateConfig(
                        formattedHosts,
                        true,
                        false,
                        srrContext.overrideTemplateName,
                        srrContext.subscriptionSettings.serveJsonAtBaseSubscription === true &&
                            srrContext.subscriptionSettings.geofilesSystemEnabled === true,
                        srrContext.subscriptionSettings.geofilesInlineRuleLimit,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['STASH'].CONTENT_TYPE,
                };

            case 'XRAY_JSON': {
                const candidateOptions = {
                    subscriptionSettings: srrContext.subscriptionSettings,
                    hosts:
                        params.activeExpiryPlan &&
                        !params.activeExpiryPlan.rows.some((item) => item.kind === 'hosts')
                            ? []
                            : (params.autoselectHosts ?? hosts),
                    user,
                    hostsOverrides,
                    fallbackOptions,
                    excludeHostsByTags: srrContext.excludeHostsByTags,
                };
                let candidates: Promise<ResolvedProxyConfig[]> | undefined;
                const autoselectCandidates = () =>
                    (candidates ??= this.resolveProxyConfigService.resolveProxyConfig({
                        ...candidateOptions,
                        selectionOnly: true,
                    }));
                const autoselectSelections = new Map<string, ResolvedProxyConfig[]>();
                let refreshCredentials = false;
                const bound = new Map<string, Promise<ResolvedProxyConfig[]>>();
                const bindAutoselect = (ownerUuid: string, sourceUuids: string[]) => {
                    const owner = hosts.find((host) => host.uuid === ownerUuid);
                    if (!owner) return Promise.resolve([]);
                    const key = JSON.stringify([ownerUuid, [...sourceUuids].sort()]);
                    if (!bound.has(key)) {
                        const selected = new Set(sourceUuids);
                        const inbounds = new Set(
                            candidateOptions.hosts
                                .filter((host) => selected.has(host.uuid))
                                .map((host) => host.configProfileInboundUuid),
                        );
                        refreshCredentials ||= formattedHosts.some(
                            (host) =>
                                !host.clientOverrides.hostScoped &&
                                inbounds.has(host.metadata.configProfileInboundUuid),
                        );
                        bound.set(
                            key,
                            this.resolveProxyConfigService.resolveProxyConfig({
                                ...candidateOptions,
                                hosts: candidateOptions.hosts.filter((host) =>
                                    selected.has(host.uuid),
                                ),
                                quotaOwnerHost: owner,
                            }),
                        );
                    }
                    return bound.get(key)!;
                };
                const renderXray = (geofileDelivery?: XrayGeofileDelivery) =>
                    this.xrayJsonGeneratorService.generateConfig({
                        onProfileReport: (report) =>
                            params.onResolvedHosts?.(
                                report.renderedHostUuids,
                                report.invalidHostUuids,
                            ),
                        hosts: formattedHosts,
                        autoselectCandidates,
                        autoselectSelections,
                        bindAutoselect,
                        isExtendedClient: srrContext.isExtendedClient,
                        overrideTemplateName: srrContext.overrideTemplateName,
                        ignoreHostXrayJsonTemplate: srrContext.ignoreHostXrayJsonTemplate,
                        subscriptionInactive:
                            user.status !== USERS_STATUS.ACTIVE || user.expireAt <= new Date(),
                        geofileDelivery,
                        geofilesEnabled:
                            srrContext.subscriptionSettings.serveJsonAtBaseSubscription === true &&
                            srrContext.subscriptionSettings.geofilesSystemEnabled === true,
                        geofilesInlineRuleLimit:
                            srrContext.subscriptionSettings.geofilesInlineRuleLimit,
                    });
                const generate = async (geofileDelivery?: XrayGeofileDelivery) => {
                    let output = await renderXray(geofileDelivery);
                    if (refreshCredentials) {
                        refreshCredentials = false;
                        formattedHosts = await this.resolveProxyConfigService.resolveProxyConfig({
                            ...candidateOptions,
                            hosts,
                            activeExpiryPlan: params.activeExpiryPlan,
                        });
                        params.onResolvedHosts?.(
                            formattedHosts
                                .filter(
                                    (host) =>
                                        host.metadata.uuid !==
                                            '00000000-0000-0000-0000-000000000000' &&
                                        !host.metadata.isDisabled &&
                                        !host.metadata.excludeFromSubscriptionTypes.includes(
                                            'XRAY_JSON',
                                        ),
                                )
                                .map((host) => host.metadata.uuid),
                        );
                        output = await renderXray(geofileDelivery);
                    }
                    return output;
                };
                const output = await automaticXrayDelivery({
                    client:
                        srrContext.subscriptionSettings.serveJsonAtBaseSubscription === true &&
                        srrContext.subscriptionSettings.geofilesSystemEnabled === true
                            ? client
                            : undefined,
                    inlineRuleLimit: srrContext.subscriptionSettings.geofilesInlineRuleLimit,
                    manualRouting: hasRouting,
                    title: params.profileTitle ?? 'Subscription',
                    profileKey: params.profileKey ?? String(user.id),
                    generate,
                });
                const retiring =
                    output.inline &&
                    client &&
                    !hasRouting &&
                    output.subscription &&
                    !JSON.parse(output.subscription).some(
                        (config: { geodata?: unknown }) => config?.geodata,
                    );
                if (retiring) {
                    output.header = new XrayGeofileDelivery(
                        client,
                        'inline',
                        params.profileTitle ?? 'Subscription',
                    ).retirementHeader(params.profileKey ?? String(user.id), Date.now(), true);
                    output.intervalHours = 0;
                }
                await this.applyGeofileRouting(
                    params,
                    client,
                    configuredHeaders,
                    output,
                    !!retiring,
                );
                return {
                    subscription: output.subscription,
                    contentType: SUBSCRIPTION_CONFIG_TYPES['XRAY_JSON'].CONTENT_TYPE,
                };
            }

            default:
                return { subscription: '', contentType: '' };
        }
    }

    private async applyGeofileRouting(
        params: IGenerateSubscription,
        client: 'happ' | 'incy' | undefined,
        configuredHeaders: Record<string, string>,
        output: {
            header?: string;
            intervalHours?: number;
            inline: boolean;
            sourceRevision?: string;
        },
        retiring: boolean,
    ): Promise<void> {
        if (!output.header) return;
        const routing = await stabilizeRoutingProfile(
            output.header,
            output.intervalHours,
            (key, fingerprint, minimum) =>
                retiring
                    ? this.rawCache.retireRoutingProfileRevision(key, fingerprint, minimum)
                    : this.rawCache.routingProfileRevision(key, fingerprint, minimum),
            // Use the resolved credential identity, never an unregistered request HWID.
            params.user.vlessUuid ?? '',
            output.sourceRevision,
        );
        if (routing)
            params.srrContext.headersToApply = {
                ...params.srrContext.headersToApply,
                routing,
                ...(output.inline ? { 'x-remnacust-geofiles-delivery': 'inline' } : {}),
                ...(client === 'incy' &&
                !Object.keys(configuredHeaders).some(
                    (key) => key.toLowerCase() === 'routing-geo-update-interval',
                )
                    ? { 'routing-geo-update-interval': String(output.intervalHours) }
                    : {}),
            };
    }

    public async generateRawSubscription(
        options: IResolveProxyConfigOptions,
    ): Promise<ResolvedProxyConfig[]> {
        const { user, hosts, hostsOverrides, subscriptionSettings, fallbackOptions } = options;

        return await this.resolveProxyConfigService.resolveProxyConfig({
            subscriptionSettings,
            hosts,
            user,
            hostsOverrides,
            fallbackOptions,
            activeExpiryPlan: options.activeExpiryPlan,
        });
    }
}

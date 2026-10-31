import { Injectable } from '@nestjs/common';

import { SUBSCRIPTION_CONFIG_TYPES } from './constants/config-types';
import { ClashGeneratorService } from './generators/clash.generator.service';
import { MihomoGeneratorService } from './generators/mihomo.generator.service';
import { SingBoxGeneratorService } from './generators/singbox.generator.service';
import { XrayJsonGeneratorService } from './generators/xray-json.generator.service';
import { XrayGeneratorService } from './generators/xray.generator.service';
import { automaticXrayDelivery } from './geofiles/automatic-xray-delivery';
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
    ) {}

    public async generateSubscription(params: IGenerateSubscription): Promise<{
        contentType: string;
        subscription: string;
    }> {
        const { srrContext, user, hosts, hostsOverrides, fallbackOptions } = params;

        const formattedHosts = await this.resolveProxyConfigService.resolveProxyConfig({
            subscriptionSettings: srrContext.subscriptionSettings,
            hosts,
            user,
            hostsOverrides,
            fallbackOptions,
            excludeHostsByTags: srrContext.excludeHostsByTags,
        });

        switch (srrContext.matchedResponseType) {
            case 'XRAY_BASE64':
                return {
                    subscription: await this.xrayGeneratorService.generateConfig(
                        formattedHosts,
                        SUBSCRIPTION_CONFIG_TYPES['XRAY_BASE64'].isBase64,
                        srrContext.isExtendedClient,
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['XRAY_BASE64'].CONTENT_TYPE,
                };

            case 'CLASH':
                return {
                    subscription: await this.clashGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
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
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['MIHOMO'].CONTENT_TYPE,
                };

            case 'SINGBOX':
                return {
                    subscription: await this.singBoxGeneratorService.generateConfig(
                        formattedHosts,
                        srrContext.overrideTemplateName,
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
                    ),
                    contentType: SUBSCRIPTION_CONFIG_TYPES['STASH'].CONTENT_TYPE,
                };

            case 'XRAY_JSON': {
                const configuredHeaders = {
                    ...srrContext.subscriptionSettings.customResponseHeaders,
                    ...srrContext.headersToApply,
                };
                const hasRouting = Object.keys(configuredHeaders).some(
                    (key) => key.toLowerCase() === 'routing',
                );
                const client = xrayGeofileClient(srrContext.userAgent);
                const generate = (geofileDelivery?: XrayGeofileDelivery) =>
                    this.xrayJsonGeneratorService.generateConfig({
                        hosts: formattedHosts,
                        isExtendedClient: srrContext.isExtendedClient,
                        overrideTemplateName: srrContext.overrideTemplateName,
                        ignoreHostXrayJsonTemplate: srrContext.ignoreHostXrayJsonTemplate,
                        geofileDelivery,
                    });
                const output = await automaticXrayDelivery({
                    client,
                    manualRouting: hasRouting,
                    title: params.profileTitle ?? 'Subscription',
                    profileKey: params.profileKey ?? String(user.id),
                    generate,
                });
                if (output.header)
                    srrContext.headersToApply = {
                        ...srrContext.headersToApply,
                        routing: output.header,
                        ...(output.inline ? { 'x-remnacust-geofiles-delivery': 'inline' } : {}),
                        ...(client === 'incy' &&
                        !Object.keys(configuredHeaders).some(
                            (key) => key.toLowerCase() === 'routing-geo-update-interval',
                        )
                            ? { 'routing-geo-update-interval': String(output.intervalHours) }
                            : {}),
                    };
                return {
                    subscription: output.subscription,
                    contentType: SUBSCRIPTION_CONFIG_TYPES['XRAY_JSON'].CONTENT_TYPE,
                };
            }

            default:
                return { subscription: '', contentType: '' };
        }
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
        });
    }
}

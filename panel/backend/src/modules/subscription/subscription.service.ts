import dayjs from 'dayjs';
import _ from 'lodash';
import pMap from 'p-map';

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TypedConfigService } from '@common/config/app-config';
import { fail, ok, TResult } from '@common/types';
import { prettyBytesUtil } from '@common/utils/bytes/pretty-bytes.util';
import { hasContent } from '@common/utils/convert-type';
import { HwidHeaders } from '@common/utils/extract-hwid-headers';
import { effectiveUserExpiry, frozenRemainingMs } from '@common/utils/frozen-user-lifetime';
import { isTextRemark } from '@common/utils/templates/is-text-remark';
import { renderSubscriptionAction } from '@common/utils/templates/render-subscription-action';
import { TemplateEngine } from '@common/utils/templates/replace-templates-values';
import { safeTemplateHeader } from '@common/utils/templates/safe-template-header';
import { ERRORS, EVENTS, TSubscriptionTemplateType, USERS_STATUS } from '@libs/contracts/constants';
import { THwidSettings } from '@libs/contracts/models';

import { UserHwidDeviceEvent } from '@integration-modules/notifications/interfaces';

import { ExternalSquadEntity } from '@modules/external-squads/entities/external-squad.entity';
import { GetCachedExternalSquadSettingsQuery } from '@modules/external-squads/queries/get-cached-external-squad-settings';
import { GetCachedTemplateNameQuery } from '@modules/external-squads/queries/get-template-name';
import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { isHostTrafficLimited, isHostTrafficPaused } from '@modules/hosts/utils/host-traffic-limit';
import { CreateWithAdvisoryLockCommand } from '@modules/hwid-user-devices/commands/create-with-advisory-lock';
import { DeviceAccessService } from '@modules/hwid-user-devices/device-access.service';
import { HwidUserDeviceEntity } from '@modules/hwid-user-devices/entities/hwid-user-device.entity';
import { CheckHwidExistsQuery } from '@modules/hwid-user-devices/queries/check-hwid-exists/check-hwid-exists.query';
import { GetUserDevicesQuery } from '@modules/hwid-user-devices/queries/get-user-devices.query';
import type { ISRRContext } from '@modules/subscription-response-rules/interfaces';
import { ResponseRulesMatcherService } from '@modules/subscription-response-rules/services/response-rules-matcher.service';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities/subscription-settings.entity';
import { GetCachedSubscriptionSettingsQuery } from '@modules/subscription-settings/queries/get-cached-subscrtipion-settings';
import { isJsonSubscriptionFallbackSupported } from '@modules/subscription-template/constants';
import { XrayGeneratorService } from '@modules/subscription-template/generators/xray.generator.service';
import { RenderTemplatesService } from '@modules/subscription-template/render-templates.service';
import { ResolvedProxyConfig } from '@modules/subscription-template/resolve-proxy/interfaces';
import { ResolveProxyConfigService } from '@modules/subscription-template/resolve-proxy/resolve-proxy-config.service';
import { UserEntity } from '@modules/users/entities/user.entity';
import { GetFullUserResponseModel } from '@modules/users/models';
import { GetUserByUniqueFieldQuery } from '@modules/users/queries/get-user-by-unique-field';
import { GetUserSubpageConfigQuery } from '@modules/users/queries/get-user-subpage-config';
import { GetUsersWithPaginationQuery } from '@modules/users/queries/get-users-with-pagination';

import { UsersQueuesService } from '@queue/_users/users-queues.service';

import { GetHostsForUserQuery } from '../hosts/queries/get-hosts-for-user';
import { GetSubscriptionsQueryDto } from './dto';
import {
    ISubscriptionHeaders,
    IGetSubscriptionInfo,
    IHwidCheckupResult,
    ISubscriptionRequest,
} from './interfaces';
import {
    ConnectionKeysResponseModel,
    RawSubscriptionWithHostsResponse,
    SubscriptionNotFoundResponse,
    SubscriptionUnavailableResponse,
    SubscriptionRawResponse,
    SubscriptionWithConfigResponse,
} from './models';
import { GetSubpageConfigResponseModel } from './models/get-subpage-config.response.model';
import { composeStatusAndHwidRemarks } from './utils/compose-status-hwid-remarks';
import { getSubscriptionRefillDate, getSubscriptionUserInfo } from './utils/get-user-info.headers';
import { applyHostPolicyPing } from './utils/host-policy-ping';
import { registrationBlockedRemarks } from './utils/registration-blocked-remarks';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);
    private readonly subPublicDomain: string;

    constructor(
        private readonly queryBus: QueryBus,
        private readonly configService: TypedConfigService,
        private readonly commandBus: CommandBus,
        private readonly eventEmitter: EventEmitter2,
        private readonly renderTemplatesService: RenderTemplatesService,
        private readonly resolveProxyConfigService: ResolveProxyConfigService,
        private readonly xrayGeneratorService: XrayGeneratorService,
        private readonly usersQueuesService: UsersQueuesService,
        private readonly srrMatcher: ResponseRulesMatcherService,
        private readonly deviceAccess: DeviceAccessService,
    ) {
        this.subPublicDomain = this.configService.getOrThrow('SUB_PUBLIC_DOMAIN');
    }

    public async getSubscriptionByShortUuid(
        srrContext: ISRRContext,
        shortUuid: string,
        personalToken?: string,
        preview?: {
            hosts?: {
                uuid: string;
                remark: string;
                templateUuid: string | null;
                included: boolean;
                reason: string;
                speedLimitMbps: number | null;
                deviceSpeedLimitMbps: number | null;
            }[];
        },
    ): Promise<
        | SubscriptionNotFoundResponse
        | SubscriptionUnavailableResponse
        | SubscriptionRawResponse
        | SubscriptionWithConfigResponse
    > {
        try {
            const { userAgent } = srrContext;
            let { hwidHeaders } = srrContext;

            if (srrContext.matchedResponseType === 'BROWSER') {
                if (personalToken) return new SubscriptionNotFoundResponse();
                const subscriptionInfo = await this.getSubscriptionInfo({
                    searchBy: {
                        uniqueFieldKey: 'shortUuid',
                        uniqueField: shortUuid,
                    },
                    authenticated: false,
                });

                if (!subscriptionInfo.isOk) {
                    return new SubscriptionNotFoundResponse();
                }

                return subscriptionInfo.response;
            }

            const user = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        shortUuid,
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!user.isOk) {
                return new SubscriptionNotFoundResponse();
            }

            if (personalToken && !this.deviceAccess.enabled)
                return new SubscriptionNotFoundResponse();
            if (personalToken) {
                const tokenHwid = this.deviceAccess.verifyLink(user.response, personalToken);
                if (!tokenHwid || !hwidHeaders || hwidHeaders.hwid !== tokenHwid)
                    return new SubscriptionNotFoundResponse();
            }

            if (!srrContext.overrideTemplateName) {
                if (user.response.externalSquadUuid) {
                    let templateTypeMatcher =
                        srrContext.matchedResponseType as TSubscriptionTemplateType;

                    if (templateTypeMatcher === 'XRAY_BASE64') {
                        // In case if XRAY_BASE64 matched as fallback
                        templateTypeMatcher = 'XRAY_JSON';
                    }

                    const templateName = await this.queryBus.execute(
                        new GetCachedTemplateNameQuery(
                            user.response.externalSquadUuid,
                            templateTypeMatcher,
                        ),
                    );

                    if (templateName.isOk) {
                        srrContext.overrideTemplateName = templateName.response;
                    }
                }
            }

            const { subscriptionSettings: patchedSubscriptionSettings, hostsOverrides } =
                await this.applyMaybeExternalSquadOverrides(
                    srrContext.subscriptionSettings,
                    user.response.externalSquadUuid,
                );

            srrContext.subscriptionSettings = patchedSubscriptionSettings;

            const subscriptionSettings = srrContext.subscriptionSettings;

            const subscriptionInactive =
                user.response.status === USERS_STATUS.FROZEN ||
                user.response.status === USERS_STATUS.DISABLED ||
                user.response.status === USERS_STATUS.EXPIRED ||
                user.response.expireAt <= new Date();

            if (hwidHeaders) {
                const device = await this.queryBus.execute(
                    new CheckHwidExistsQuery(hwidHeaders.hwid, user.response.id),
                );
                if (!device.isOk || (preview && !device.response.exists))
                    return new SubscriptionNotFoundResponse();
                if (device.response.blocked) {
                    return this.getBlockedHwidSubscription(
                        srrContext,
                        user.response,
                        subscriptionSettings,
                    );
                }
            }

            if (await this.deviceAccess.registrationDenied(user.response.id, hwidHeaders?.hwid))
                return this.getRegistrationBlockedSubscription(
                    srrContext,
                    user.response,
                    subscriptionSettings,
                );

            let personalCredentialsReady = false;
            if (this.deviceAccess.enabled) {
                if (
                    !subscriptionInactive &&
                    !hwidHeaders &&
                    (await this.deviceAccess.hasBlockedDevice(user.response.id))
                )
                    return new SubscriptionNotFoundResponse();
                const deviceStatus = hwidHeaders
                    ? preview
                        ? 'OK'
                        : await this.deviceAccess.register(
                              user.response,
                              hwidHeaders,
                              subscriptionSettings.hwidSettings,
                              srrContext.ip,
                          )
                    : 'LEGACY';
                personalCredentialsReady = deviceStatus === 'OK';
                if (deviceStatus === 'REGISTRATION_BLOCKED')
                    return this.getRegistrationBlockedSubscription(
                        srrContext,
                        user.response,
                        subscriptionSettings,
                    );
                if (deviceStatus === 'NODE_ERROR') return new SubscriptionUnavailableResponse();
                if (deviceStatus !== 'OK' && deviceStatus !== 'LEGACY') {
                    if (deviceStatus === 'BLOCKED') {
                        return this.getBlockedHwidSubscription(
                            srrContext,
                            user.response,
                            subscriptionSettings,
                        );
                    }
                    return this.getHwidDeniedSubscription(
                        srrContext,
                        user.response,
                        subscriptionSettings,
                        {
                            subscriptionAllowed: false,
                            maxDeviceReached: true,
                            hwidNotSupported: false,
                            limitBypassed: false,
                            deviceBlocked: false,
                        },
                    );
                }
            }

            const renderUser =
                personalCredentialsReady && hwidHeaders
                    ? (Object.assign(
                          Object.create(Object.getPrototypeOf(user.response)),
                          user.response,
                          this.deviceAccess.credentials(
                              user.response.id,
                              hwidHeaders.hwid,
                              user.response.vlessUuid,
                          ),
                      ) as UserEntity)
                    : preview
                      ? (Object.assign(
                            Object.create(Object.getPrototypeOf(user.response)),
                            user.response,
                        ) as UserEntity)
                      : user.response;
            Object.defineProperty(renderUser, 'hostIdentityContext', {
                value: {
                    hwid: hwidHeaders?.hwid ?? null,
                    parentVlessUuid: user.response.vlessUuid,
                    ...(preview ? { preview: true } : {}),
                },
                configurable: true,
            });

            if (srrContext.respondWithRemarks) {
                const { subscription, contentType } =
                    await this.renderTemplatesService.generateSubscription({
                        srrContext,
                        user: renderUser,
                        hosts: [],
                        fallbackOptions: {
                            respondWithRemarks: srrContext.respondWithRemarks,
                        },
                    });

                return new SubscriptionWithConfigResponse({
                    headers: this.getUserProfileHeadersInfo(
                        user.response,
                        subscriptionSettings,
                        false,
                        srrContext.respondWithRemarks,
                    ),
                    body: subscription,
                    contentType: contentType,
                });
            }

            let hwidCheckup: null | IHwidCheckupResult = null;

            if (
                !preview &&
                subscriptionSettings.hwidSettings.enabled &&
                !srrContext.disableHwidCheck
            ) {
                const hwidCheckupResult = await this.checkHwidDeviceLimit(
                    user.response,
                    hwidHeaders,
                    subscriptionSettings.hwidSettings,
                    srrContext.ip,
                );

                if (!hwidCheckupResult.isOk) {
                    this.logger.error(`Error checking hwid device limit: ${hwidCheckupResult}`);
                    return new SubscriptionNotFoundResponse();
                }

                hwidCheckup = hwidCheckupResult.response;
                if (hwidCheckup.registrationBlocked)
                    return this.getRegistrationBlockedSubscription(
                        srrContext,
                        user.response,
                        subscriptionSettings,
                    );

                if (!hwidCheckup.subscriptionAllowed) {
                    if (hwidCheckup.deviceBlocked) {
                        return this.getBlockedHwidSubscription(
                            srrContext,
                            user.response,
                            subscriptionSettings,
                        );
                    }
                    return this.getHwidDeniedSubscription(
                        srrContext,
                        user.response,
                        subscriptionSettings,
                        hwidCheckup,
                    );
                }
            } else if (!preview) {
                void this.checkAndUpsertHwidUserDevice(user.response, hwidHeaders, srrContext.ip);
            }

            if (
                srrContext.subscriptionSettings.serveJsonAtBaseSubscription &&
                srrContext.matchedResponseType === 'XRAY_BASE64' &&
                !srrContext.ignoreServeJsonAtBaseSubscription
            ) {
                if (isJsonSubscriptionFallbackSupported(srrContext.userAgent)) {
                    srrContext.matchedResponseType = 'XRAY_JSON';
                }
            }

            const hosts = await this.queryBus.execute(
                new GetHostsForUserQuery(
                    user.response.id,
                    false,
                    ['XRAY_JSON', 'MIHOMO', 'STASH', 'CLASH', 'SINGBOX'].includes(
                        srrContext.matchedResponseType,
                    ),
                ),
            );

            if (!hosts.isOk) {
                return new SubscriptionNotFoundResponse();
            }

            const subscriptionEnded =
                user.response.status === USERS_STATUS.FROZEN ||
                user.response.status === USERS_STATUS.EXPIRED ||
                user.response.status === USERS_STATUS.DISABLED ||
                (user.response.status === USERS_STATUS.ACTIVE &&
                    user.response.expireAt <= new Date());
            const presentationHosts = hosts.response.filter((host) =>
                subscriptionEnded ? host.alwaysAvailable : !host.onlyWhenInactive,
            );

            if (!preview)
                void this.updateAndReportSubscriptionRequest({
                    userId: user.response.id,
                    userAgent: userAgent,
                    requestIp: srrContext.ip,
                    matchedRuleName: srrContext.matchedRuleName,
                    matchedResponseType: srrContext.matchedResponseType,
                });

            const limitedHostUuids = new Set(
                presentationHosts.filter(isHostTrafficLimited).map((host) => host.uuid),
            );
            const availableHosts = presentationHosts.filter(
                (host) => !limitedHostUuids.has(host.uuid),
            );
            if (preview)
                preview.hosts = hosts.response.map((host) => {
                    const reason = !presentationHosts.includes(host)
                        ? 'subscriptionStatus'
                        : limitedHostUuids.has(host.uuid)
                          ? 'trafficLimit'
                          : host.excludeFromSubscriptionTypes.includes(
                                  srrContext.matchedResponseType as TSubscriptionTemplateType,
                              )
                            ? 'formatExcluded'
                            : host.tags.some((tag) => srrContext.excludeHostsByTags?.has(tag))
                              ? 'ruleExcluded'
                              : 'candidate';
                    return {
                        uuid: host.uuid,
                        remark: host.remark,
                        templateUuid: srrContext.ignoreHostXrayJsonTemplate
                            ? null
                            : host.xrayJsonTemplateUuid,
                        included: reason === 'candidate',
                        reason,
                        speedLimitMbps: host.speedLimitMbps,
                        deviceSpeedLimitMbps: host.deviceSpeedLimitMbps,
                    };
                });
            const subscription = await this.renderTemplatesService.generateSubscription({
                srrContext,
                user: renderUser,
                hosts: subscriptionSettings.randomizeHosts
                    ? _.shuffle(availableHosts)
                    : availableHosts,
                hostsOverrides,
            });

            const pausedHosts = presentationHosts.filter(isHostTrafficPaused);
            const hostLimitRemarks = [
                ...(pausedHosts.length
                    ? (subscriptionSettings.customRemarks.hostTrafficPaused ?? [
                          'Traffic is temporarily paused',
                      ])
                    : []),
                ...(presentationHosts.some(
                    (h) => isHostTrafficLimited(h) && !isHostTrafficPaused(h),
                )
                    ? (subscriptionSettings.customRemarks.hostTrafficLimit ?? [])
                    : []),
            ];
            if (await this.deviceAccess.registrationDenied(user.response.id, hwidHeaders?.hwid))
                return this.getRegistrationBlockedSubscription(
                    srrContext,
                    user.response,
                    subscriptionSettings,
                );
            const headers = this.getUserProfileHeadersInfo(
                user.response,
                subscriptionSettings,
                hwidCheckup !== null && !hwidCheckup.limitBypassed,
                presentationHosts.length === 0
                    ? subscriptionSettings.customRemarks.emptyHosts
                    : undefined,
                hostLimitRemarks,
                presentationHosts,
            );
            if (limitedHostUuids.size && subscriptionSettings.isShowCustomRemarks) {
                const announcement = hostLimitRemarks
                    .map((remark) =>
                        TemplateEngine.formatWithUser(
                            remark,
                            user.response,
                            subscriptionSettings,
                            this.subPublicDomain,
                            hosts.response,
                        ).trim(),
                    )
                    .find(Boolean);
                if (announcement) {
                    headers.announce = `base64:${Buffer.from(announcement.slice(0, 500), 'utf8').toString('base64')}`;
                }
            }

            return new SubscriptionWithConfigResponse({
                headers: {
                    ...headers,
                    ...(personalCredentialsReady && hwidHeaders
                        ? {
                              'x-device-subscription-url': `https://${this.subPublicDomain}/${shortUuid}/device/${this.deviceAccess.linkToken(user.response, hwidHeaders.hwid)}`,
                          }
                        : {}),
                },
                body: subscription.subscription,
                contentType: subscription.contentType,
            });
        } catch (error) {
            this.logger.error(error);
            return new SubscriptionUnavailableResponse();
        }
    }

    public async previewDevice(
        userId: bigint,
        hwid: string,
        path: 'base' | 'json' | 'mihomo' | 'clash' | 'singbox' | 'stash',
        userAgent?: string,
        includeConfig = false,
    ) {
        const result = await this.queryBus.execute(
            new GetUserByUniqueFieldQuery({ id: userId }, { activeInternalSquads: false }),
        );
        if (!result.isOk) throw new NotFoundException('User not found');
        const devices = await this.queryBus.execute(new GetUserDevicesQuery(userId));
        const device = devices.find((item) => item.hwid === hwid);
        if (!device) throw new NotFoundException('Registered device not found');
        const settings = await this.queryBus.execute(new GetCachedSubscriptionSettingsQuery());
        if (!settings?.responseRules)
            throw new BadRequestException('Subscription settings unavailable');
        const agent = userAgent || device.userAgent;
        if (!agent) throw new BadRequestException('Select the client User-Agent');
        const match = await this.srrMatcher.matchRules(
            settings.responseRules,
            {
                'user-agent': agent,
                'x-hwid': hwid,
                'x-device-id': hwid,
                'x-device-os': device.platform ?? undefined,
                'x-ver-os': device.osVersion ?? undefined,
                'x-device-model': device.deviceModel ?? undefined,
                'x-remnawave-injected-short-uuid': result.response.shortUuid,
            },
            path === 'base' ? undefined : path,
        );
        if (
            !match.matched ||
            !match.responseType ||
            !['XRAY_JSON', 'XRAY_BASE64', 'MIHOMO', 'CLASH', 'SINGBOX', 'STASH'].includes(
                match.responseType,
            )
        )
            return {
                allowed: false,
                reason: 'responseRule',
                format: match.responseType ?? 'BLOCK',
                rule: match.matchedRule?.name ?? null,
                hosts: [],
            };
        const mods = match.matchedRule?.responseModifications;
        const context: ISRRContext = {
            userAgent: agent,
            ip: device.requestIp ?? '',
            hwidHeaders: {
                hwid,
                platform: device.platform ?? undefined,
                osVersion: device.osVersion ?? undefined,
                deviceModel: device.deviceModel ?? undefined,
                userAgent: agent,
            },
            isExtendedClient: false,
            matchedResponseType: match.responseType,
            matchedRuleName: match.matchedRule?.name,
            subscriptionSettings: settings,
            overrideTemplateName: mods?.subscriptionTemplate,
            ignoreHostXrayJsonTemplate: mods?.ignoreHostXrayJsonTemplate,
            ignoreServeJsonAtBaseSubscription: mods?.ignoreServeJsonAtBaseSubscription,
            disableHwidCheck: mods?.disableHwidCheck,
            encryption: mods?.encryption,
            excludeHostsByTags: mods?.excludeHostsByTags
                ? new Set(mods.excludeHostsByTags)
                : undefined,
            respondWithRemarks: mods?.respondWithRemarks,
            headersToApply: mods?.headers
                ? Object.fromEntries(mods.headers.map((h) => [h.key, h.value]))
                : undefined,
        };
        const { isExtendedClient } = await import('@modules/subscription-template/constants');
        context.isExtendedClient = isExtendedClient(agent);
        if (!context.isExtendedClient && mods?.additionalExtendedClientsRegex?.length) {
            const { configuredRegex } = await import('@common/utils/bounded-regex');
            const deadline = Date.now() + 1000;
            for (const pattern of mods.additionalExtendedClientsRegex)
                if (await configuredRegex.test(pattern, agent, '', deadline)) {
                    context.isExtendedClient = true;
                    break;
                }
        }
        const trace: NonNullable<Parameters<SubscriptionService['getSubscriptionByShortUuid']>[3]> =
            {};
        const response = await this.getSubscriptionByShortUuid(
            context,
            result.response.shortUuid,
            undefined,
            trace,
        );
        if (!(response instanceof SubscriptionWithConfigResponse))
            return {
                allowed: false,
                reason: 'generationUnavailable',
                format: context.matchedResponseType,
                hosts: trace.hosts ?? [],
            };
        const headers = {
            ...context.subscriptionSettings.customResponseHeaders,
            ...response.headers,
            ...context.headersToApply,
        };
        const routing = Object.entries(headers).find(
            ([key]) => key.toLowerCase() === 'routing',
        )?.[1];
        const inlineFallback = Object.keys(headers).some(
            (key) => key.toLowerCase() === 'x-remnacust-geofiles-delivery',
        );
        const bytes = Buffer.byteLength(response.body);
        return {
            allowed: !device.blocked,
            reason: device.blocked ? 'deviceBlocked' : null,
            checkedAt: new Date().toISOString(),
            format: context.matchedResponseType,
            rule: context.matchedRuleName ?? null,
            template: context.overrideTemplateName ?? null,
            hosts: trace.hosts ?? [],
            bytes,
            contentType: response.contentType,
            geofileDelivery: inlineFallback
                ? 'inlineFallback'
                : routing
                  ? 'downloadProfile'
                  : 'inlineOrNative',
            config: includeConfig && bytes <= 2 * 1024 * 1024 ? response.body : null,
            configTooLarge: includeConfig && bytes > 2 * 1024 * 1024,
        };
    }

    public async getRawSubscriptionByShortUuid(
        shortUuid: string,
        withDisabledHosts: boolean,
        hwidHeaders: HwidHeaders | null,
        userAgent: string,
        requestIp?: string,
    ): Promise<TResult<RawSubscriptionWithHostsResponse>> {
        try {
            const userResult = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        shortUuid,
                    },
                    {
                        activeInternalSquads: true,
                    },
                ),
            );
            if (!userResult.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }
            const user = userResult.response;

            const settingEntity = await this.queryBus.execute(
                new GetCachedSubscriptionSettingsQuery(),
            );

            if (!settingEntity) {
                return fail(ERRORS.SUBSCRIPTION_SETTINGS_NOT_FOUND);
            }

            const {
                subscriptionSettings: patchedSettingEntity,
                hostsOverrides: patchedHostsOverrides,
            } = await this.applyMaybeExternalSquadOverrides(settingEntity, user.externalSquadUuid);

            if (
                this.deviceAccess.enabled &&
                !hwidHeaders &&
                (await this.deviceAccess.hasBlockedDevice(user.id))
            )
                return fail(ERRORS.FORBIDDEN);
            if (await this.deviceAccess.registrationDenied(user.id, hwidHeaders?.hwid))
                return fail(ERRORS.FORBIDDEN);
            let isDeviceBlocked = false;
            if (hwidHeaders) {
                const device = await this.queryBus.execute(
                    new CheckHwidExistsQuery(hwidHeaders.hwid, user.id),
                );
                if (!device.isOk) return fail(ERRORS.INTERNAL_SERVER_ERROR);
                isDeviceBlocked = device.response.blocked;
            }
            const deviceStatus = isDeviceBlocked
                ? 'BLOCKED'
                : this.deviceAccess.enabled && hwidHeaders
                  ? await this.deviceAccess.register(
                        user,
                        hwidHeaders,
                        patchedSettingEntity.hwidSettings,
                        requestIp,
                    )
                  : this.deviceAccess.enabled
                    ? 'LEGACY'
                    : 'OK';
            if (deviceStatus === 'REGISTRATION_BLOCKED') return fail(ERRORS.FORBIDDEN);
            if (deviceStatus === 'NODE_ERROR') return fail(ERRORS.INTERNAL_SERVER_ERROR);
            const renderUser =
                this.deviceAccess.enabled && hwidHeaders && deviceStatus === 'OK'
                    ? (Object.assign(
                          Object.create(Object.getPrototypeOf(user)),
                          user,
                          this.deviceAccess.credentials(user.id, hwidHeaders.hwid, user.vlessUuid),
                      ) as UserEntity)
                    : user;
            Object.defineProperty(renderUser, 'hostIdentityContext', {
                value: { hwid: hwidHeaders?.hwid ?? null, parentVlessUuid: user.vlessUuid },
                configurable: true,
            });

            let hwidCheckup: null | IHwidCheckupResult = null;

            const headers = this.getUserProfileHeadersInfo(
                user,
                patchedSettingEntity,
                false,
                deviceStatus === 'BLOCKED'
                    ? this.getBlockedHwidRemarks(user, patchedSettingEntity)
                    : undefined,
            );

            if (deviceStatus === 'BLOCKED' || deviceStatus === 'LIMIT_REACHED') {
                hwidCheckup = {
                    subscriptionAllowed: false,
                    maxDeviceReached: deviceStatus === 'LIMIT_REACHED',
                    hwidNotSupported: false,
                    limitBypassed: false,
                    deviceBlocked: deviceStatus === 'BLOCKED',
                };
                headers[
                    deviceStatus === 'BLOCKED' ? 'x-hwid-blocked' : 'x-hwid-max-devices-reached'
                ] = 'true';
                if (deviceStatus === 'BLOCKED') {
                    const announcement = TemplateEngine.formatWithUser(
                        this.getBlockedHwidRemarks(user, patchedSettingEntity)[0],
                        user,
                        patchedSettingEntity,
                        this.subPublicDomain,
                    )
                        .trim()
                        .slice(0, 500);
                    headers.announce = `base64:${Buffer.from(announcement, 'utf8').toString('base64')}`;
                }
            }

            if (!hwidCheckup && patchedSettingEntity.hwidSettings.enabled) {
                const hwidCheckupResult = await this.checkHwidDeviceLimit(
                    user,
                    hwidHeaders,
                    patchedSettingEntity.hwidSettings,
                    requestIp,
                );

                if (!hwidCheckupResult.isOk) {
                    this.logger.error(`Error checking hwid device limit: ${hwidCheckupResult}`);
                    return fail(ERRORS.INTERNAL_SERVER_ERROR);
                }

                hwidCheckup = hwidCheckupResult.response;
                if (hwidCheckup.registrationBlocked) return fail(ERRORS.FORBIDDEN);

                if (!hwidCheckup.limitBypassed) {
                    headers['x-hwid-active'] = 'true';
                }

                if (hwidCheckup.deviceBlocked) {
                    headers['x-hwid-blocked'] = 'true';
                }

                if (!hwidCheckup.subscriptionAllowed) {
                    if (
                        hwidCheckup.maxDeviceReached &&
                        patchedSettingEntity.hwidSettings.maxDevicesAnnounce
                    ) {
                        headers.announce = `base64:${Buffer.from(
                            patchedSettingEntity.hwidSettings.maxDevicesAnnounce,
                        ).toString('base64')}`;
                    }

                    if (hwidCheckup.hwidNotSupported) {
                        headers['x-hwid-not-supported'] = 'true';
                    }

                    if (hwidCheckup.maxDeviceReached) {
                        headers['x-hwid-max-devices-reached'] = 'true';
                    }

                    headers['x-hwid-limit'] = 'true'; // v2rayTUN
                }
            } else {
                void this.checkAndUpsertHwidUserDevice(user, hwidHeaders, requestIp);
            }

            let subscription: ResolvedProxyConfig[] | undefined;

            if (!hwidCheckup || hwidCheckup.subscriptionAllowed) {
                const hosts = await this.queryBus.execute(
                    new GetHostsForUserQuery(user.id, withDisabledHosts, true),
                );

                if (!hosts.isOk) {
                    return fail(ERRORS.GET_ALL_HOSTS_ERROR);
                }

                subscription = await this.renderTemplatesService.generateRawSubscription({
                    subscriptionSettings: patchedSettingEntity,
                    user: renderUser,
                    hosts: patchedSettingEntity.randomizeHosts
                        ? _.shuffle(hosts.response)
                        : hosts.response,
                    hostsOverrides: patchedHostsOverrides,
                });
            } else if (
                hwidCheckup.deviceBlocked ||
                (patchedSettingEntity.isShowCustomRemarks &&
                    (hwidCheckup.maxDeviceReached || hwidCheckup.hwidNotSupported))
            ) {
                subscription = await this.renderTemplatesService.generateRawSubscription({
                    subscriptionSettings: patchedSettingEntity,
                    user,
                    hosts: [],
                    hostsOverrides: patchedHostsOverrides,
                    fallbackOptions: {
                        showHwidBlockedRemarks: hwidCheckup.deviceBlocked,
                        showHwidMaxDeviceRemarks: hwidCheckup.maxDeviceReached,
                        showHwidNotSupportedRemarks: hwidCheckup.hwidNotSupported,
                    },
                });
            }

            void this.updateAndReportSubscriptionRequest({
                userId: user.id,
                userAgent: userAgent,
                requestIp: requestIp,
                matchedRuleName: 'RAW',
                matchedResponseType: 'RAW',
            });

            return ok(
                new RawSubscriptionWithHostsResponse({
                    user: new GetFullUserResponseModel(
                        hwidCheckup && !hwidCheckup.subscriptionAllowed
                            ? (Object.assign(Object.create(Object.getPrototypeOf(user)), user, {
                                  vlessUuid: '',
                                  trojanPassword: '',
                                  ssPassword: '',
                              }) as UserEntity)
                            : renderUser,
                        this.subPublicDomain,
                    ),
                    convertedUserInfo: {
                        daysLeft: dayjs(effectiveUserExpiry(user)).diff(dayjs(), 'day'),
                        trafficUsed: prettyBytesUtil(user.userTraffic.usedTrafficBytes),
                        trafficLimit: prettyBytesUtil(user.trafficLimitBytes),
                        lifetimeTrafficUsed: prettyBytesUtil(
                            user.userTraffic.lifetimeUsedTrafficBytes,
                        ),
                        hwidCheckup,
                    },
                    headers,
                    resolvedProxyConfigs: subscription ?? [],
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    public async getSubscriptionInfo(
        params: IGetSubscriptionInfo,
    ): Promise<TResult<SubscriptionRawResponse>> {
        try {
            const { searchBy, authenticated, userEntity: userEntityParam } = params;

            let userEntity: UserEntity | undefined = userEntityParam;

            if (!userEntity && searchBy) {
                const userResult = await this.queryBus.execute(
                    new GetUserByUniqueFieldQuery(
                        {
                            [searchBy.uniqueFieldKey]: searchBy.uniqueField,
                        },
                        {
                            activeInternalSquads: false,
                        },
                    ),
                );

                if (!userResult.isOk) {
                    return fail(ERRORS.USER_NOT_FOUND);
                }

                userEntity = userResult.response;
            }

            if (!userEntity) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            let settings: SubscriptionSettingsEntity | null = null;
            let hostsOverrides: ExternalSquadEntity['hostOverrides'] | undefined;

            if (params.overrides) {
                settings = params.overrides.subscriptionSettings;
                hostsOverrides = params.overrides.hostsOverrides;
            } else if (params.subscriptionSettingsRaw) {
                settings = params.subscriptionSettingsRaw;
            } else {
                settings = await this.queryBus.execute(new GetCachedSubscriptionSettingsQuery());
            }

            if (!settings) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            if (userEntity.externalSquadUuid && !params.overrides) {
                const {
                    subscriptionSettings: patchedSubscriptionSettings,
                    hostsOverrides: patchedHostsOverrides,
                } = await this.applyMaybeExternalSquadOverrides(
                    settings,
                    userEntity.externalSquadUuid,
                );

                settings = patchedSubscriptionSettings;
                hostsOverrides = patchedHostsOverrides;
            }

            let formattedHosts: ResolvedProxyConfig[] = [];
            let xrayLinks: string[] = [];
            const ssConfLinks: Record<string, string> = {};

            if (
                (!settings.hwidSettings.enabled || authenticated) &&
                (!this.deviceAccess.enabled ||
                    !(await this.deviceAccess.hasBlockedDevice(userEntity.id)))
            ) {
                const hostsResponse = await this.queryBus.execute(
                    new GetHostsForUserQuery(userEntity.id, false, false),
                );

                formattedHosts = await this.resolveProxyConfigService.resolveProxyConfig({
                    subscriptionSettings: settings,
                    hosts: hostsResponse.isOk ? hostsResponse.response : [],
                    user: userEntity,
                    hostsOverrides,
                });

                xrayLinks = this.xrayGeneratorService.generateLinks(formattedHosts, false);
            }

            return ok(await this.getUserInfo(userEntity, xrayLinks, ssConfLinks));
        } catch (error) {
            this.logger.error(`Error getting subscription info: ${error}`);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }

    private async getUserInfo(
        user: UserEntity,
        links: string[],
        ssConfLinks: Record<string, string>,
    ): Promise<SubscriptionRawResponse> {
        return new SubscriptionRawResponse({
            isFound: true,
            user: {
                shortUuid: user.shortUuid,
                daysLeft: dayjs(effectiveUserExpiry(user)).diff(dayjs(), 'day'),
                frozenRemainingMs: frozenRemainingMs(user),
                trafficUsed: prettyBytesUtil(user.userTraffic.usedTrafficBytes),
                trafficLimit: prettyBytesUtil(user.trafficLimitBytes),
                lifetimeTrafficUsed: prettyBytesUtil(user.userTraffic.lifetimeUsedTrafficBytes),
                lifetimeTrafficUsedBytes: user.userTraffic.lifetimeUsedTrafficBytes.toString(),
                trafficLimitBytes: user.trafficLimitBytes.toString(),
                trafficUsedBytes: user.userTraffic.usedTrafficBytes.toString(),
                username: user.username,
                expiresAt: effectiveUserExpiry(user),
                isActive: user.status === USERS_STATUS.ACTIVE,
                userStatus: user.status,
                trafficLimitStrategy: user.trafficLimitStrategy,
            },
            links,
            ssConfLinks,
            subscriptionUrl: this.resolveSubscriptionUrl(user.shortUuid),
        });
    }

    public async getAllSubscriptions(query: GetSubscriptionsQueryDto): Promise<
        TResult<{
            total: number;
            subscriptions: SubscriptionRawResponse[];
        }>
    > {
        try {
            const { start, size } = query;

            const usersResponse = await this.getUsersWithPagination({ start, size });

            if (!usersResponse.isOk) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            const users = usersResponse.response.users;
            const total = usersResponse.response.total;

            const settings = await this.queryBus.execute(new GetCachedSubscriptionSettingsQuery());

            if (!settings) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            const subscriptions: SubscriptionRawResponse[] = [];

            await pMap(
                users,
                async (user) => {
                    const subscriptionInfo = await this.getSubscriptionInfo({
                        userEntity: user,
                        authenticated: true,
                        subscriptionSettingsRaw: settings,
                    });

                    if (!subscriptionInfo.isOk) {
                        return;
                    }

                    subscriptions.push(subscriptionInfo.response);
                },
                { concurrency: 70 },
            );

            return ok({ total, subscriptions });
        } catch (error) {
            this.logger.error(`Error getting all subscriptions: ${error}`);
            return fail(ERRORS.GETTING_ALL_SUBSCRIPTIONS_ERROR);
        }
    }

    private async getHwidDeniedSubscription(
        srrContext: ISRRContext,
        user: UserEntity,
        subscriptionSettings: SubscriptionSettingsEntity,
        hwidCheckup: IHwidCheckupResult,
    ): Promise<SubscriptionWithConfigResponse> {
        const hwidRemarks = hwidCheckup.maxDeviceReached
            ? subscriptionSettings.customRemarks.HWIDMaxDevicesExceeded
            : subscriptionSettings.customRemarks.HWIDNotSupported;
        const response = new SubscriptionWithConfigResponse({
            headers: this.getUserProfileHeadersInfo(user, subscriptionSettings, false, hwidRemarks),
            body: '',
            contentType: 'text/plain',
        });

        if (!hwidCheckup.limitBypassed) {
            response.headers['x-hwid-active'] = 'true';
        }

        if (hwidCheckup.maxDeviceReached && subscriptionSettings.hwidSettings.maxDevicesAnnounce) {
            response.headers.announce = TemplateEngine.formatWithUser(
                `rwEncodeBase64:${subscriptionSettings.hwidSettings.maxDevicesAnnounce}`,
                user,
                subscriptionSettings,
                this.subPublicDomain,
            );
        }

        if (
            (hwidCheckup.maxDeviceReached || hwidCheckup.hwidNotSupported) &&
            subscriptionSettings.isShowCustomRemarks
        ) {
            const { subscription, contentType } =
                await this.renderTemplatesService.generateSubscription({
                    srrContext,
                    user,
                    hosts: [],
                    fallbackOptions: {
                        showHwidMaxDeviceRemarks: hwidCheckup.maxDeviceReached,
                        showHwidNotSupportedRemarks: hwidCheckup.hwidNotSupported,
                    },
                });

            response.body = subscription;
            response.contentType = contentType;
        }

        if (hwidCheckup.hwidNotSupported) {
            response.headers['x-hwid-not-supported'] = 'true';
        }

        if (hwidCheckup.maxDeviceReached) {
            response.headers['x-hwid-max-devices-reached'] = 'true';
        }

        response.headers['x-hwid-limit'] = 'true'; // v2rayTUN

        return response;
    }

    private async getRegistrationBlockedSubscription(
        srrContext: ISRRContext,
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
    ): Promise<SubscriptionWithConfigResponse> {
        const safe = registrationBlockedRemarks(user, settings);
        const { subscription, contentType } =
            await this.renderTemplatesService.generateSubscription({
                srrContext,
                user,
                hosts: [],
                fallbackOptions: { showHwidRegistrationBlockedRemarks: true },
            });
        return new SubscriptionWithConfigResponse({
            body: subscription,
            contentType,
            headers: {
                ...this.getUserProfileHeadersInfo(user, settings, false, safe),
                'x-hwid-registration-blocked': 'true',
                announce: `base64:${Buffer.from(safe[0].slice(0, 500)).toString('base64')}`,
            },
        });
    }

    private async getBlockedHwidSubscription(
        srrContext: ISRRContext,
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
    ): Promise<SubscriptionWithConfigResponse> {
        const safeRemarks = this.getBlockedHwidRemarks(user, settings);
        const { subscription, contentType } =
            await this.renderTemplatesService.generateSubscription({
                srrContext,
                user,
                hosts: [],
                fallbackOptions: { showHwidBlockedRemarks: true },
            });
        const headers = this.getUserProfileHeadersInfo(user, settings, false, safeRemarks);
        const announcement = TemplateEngine.formatWithUser(
            safeRemarks[0],
            user,
            settings,
            this.subPublicDomain,
        )
            .trim()
            .slice(0, 500);
        headers.announce = `base64:${Buffer.from(announcement, 'utf8').toString('base64')}`;
        headers['x-hwid-blocked'] = 'true';

        return new SubscriptionWithConfigResponse({
            headers,
            body: subscription,
            contentType,
        });
    }

    private getBlockedHwidRemarks(
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
    ): string[] {
        if (user.status === USERS_STATUS.FROZEN) return ['Subscription frozen'];
        const hwidRemarks = (settings.customRemarks.HWIDBlocked ?? []).filter((remark) => {
            const value = remark.trim();
            return isTextRemark(value);
        });
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
                  : []
            : [];
        const effectiveStatusRemarks =
            status === 'DISABLED' &&
            settings.isShowCustomRemarks &&
            !statusRemarks.some((remark) => remark.trim())
                ? ['User is disabled']
                : statusRemarks;

        return composeStatusAndHwidRemarks(
            status,
            effectiveStatusRemarks,
            hwidRemarks.length ? hwidRemarks : ['Device is blocked'],
            settings.customRemarks,
        );
    }

    private getUserProfileHeadersInfo(
        user: UserEntity,
        settings: SubscriptionSettingsEntity,
        hwidLimit: boolean = false,
        remarksOverride?: string[],
        extraRemarks: string[] = [],
        hosts: HostWithRawInbound[] = [],
    ): ISubscriptionHeaders {
        const headers: ISubscriptionHeaders = {
            'content-disposition': `attachment; filename=${user.username}`,
            'subscription-userinfo': Object.entries(getSubscriptionUserInfo(user))
                .map(([key, val]) => `${key}=${val}`)
                .join('; '),
        };

        const refillDate = getSubscriptionRefillDate(user);
        if (refillDate) {
            headers['subscription-refill-date'] = refillDate;
        }

        if (hwidLimit) {
            headers['x-hwid-active'] = 'true';
        }

        if (settings.customResponseHeaders) {
            const userValueMap = TemplateEngine.createUserValueMap(
                user,
                settings,
                this.subPublicDomain,
                hosts,
            );

            for (const [key, value] of Object.entries(settings.customResponseHeaders)) {
                headers[key] = safeTemplateHeader(TemplateEngine.replace(value, userValueMap));
            }
        }

        applyHostPolicyPing(headers, hosts);

        const remarkValues = TemplateEngine.createUserValueMap(
            user,
            settings,
            this.subPublicDomain,
            hosts,
        );
        const action = settings.isShowCustomRemarks
            ? renderSubscriptionAction(settings.customRemarks.action, remarkValues)
            : null;
        if (action) {
            headers['x-era-subscription-action'] = Buffer.from(
                JSON.stringify(action),
                'utf8',
            ).toString('base64');
        }
        if (settings.isShowCustomRemarks) {
            const source =
                remarksOverride ??
                (
                    {
                        EXPIRED: settings.customRemarks.expiredUsers,
                        LIMITED: settings.customRemarks.limitedUsers,
                        DISABLED: settings.customRemarks.disabledUsers,
                        FROZEN: ['Subscription frozen'],
                    } as Record<string, string[]>
                )[user.status];
            if (source || extraRemarks.some((remark) => remark.trim())) {
                const items: Array<{
                    kind: string;
                    text?: string;
                    buttonText?: string;
                    url?: string;
                }> = [];
                let hostMarker = false;
                for (const remark of (source ?? []).slice(0, 24)) {
                    if (remark.trim() === '{{FREE_HOST}}') {
                        if (!hostMarker && !remarksOverride) items.push({ kind: 'hosts' });
                        hostMarker = true;
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(remark);
                        if (parsed.type === 'link') {
                            const action = renderSubscriptionAction(parsed, remarkValues);
                            if (action) items.push({ kind: 'action', ...action });
                            continue;
                        }
                        if (parsed.finalRemark) continue;
                    } catch {
                        /* plain text */
                    }
                    const text = TemplateEngine.replace(
                        remark,
                        TemplateEngine.createUserValueMap(
                            user,
                            settings,
                            this.subPublicDomain,
                            hosts,
                        ),
                    ).slice(0, 500);
                    if (text.trim()) items.push({ kind: 'text', text });
                }
                if (!hostMarker && !remarksOverride) {
                    if (settings.customRemarks.alwaysAvailableHostsPosition === 'before')
                        items.unshift({ kind: 'hosts' });
                    else items.push({ kind: 'hosts' });
                }
                const userValueMapForExtra = TemplateEngine.createUserValueMap(
                    user,
                    settings,
                    this.subPublicDomain,
                    hosts,
                );
                for (const remark of extraRemarks.slice(0, 24)) {
                    const text = TemplateEngine.replace(remark, userValueMapForExtra).slice(0, 500);
                    if (text.trim()) items.push({ kind: 'text', text });
                }
                // Bound the response header, including UTF-8/base64 expansion.
                while (items.length && Buffer.byteLength(JSON.stringify(items)) > 4500) items.pop();
                if (items.length)
                    headers['x-era-subscription-presentation'] = Buffer.from(
                        JSON.stringify(items),
                    ).toString('base64');
            }
        }
        return headers;
    }

    private async applyMaybeExternalSquadOverrides(
        subscriptionSettings: SubscriptionSettingsEntity,
        externalSquadUuid: string | null | undefined,
    ): Promise<{
        subscriptionSettings: SubscriptionSettingsEntity;
        hostsOverrides: ExternalSquadEntity['hostOverrides'] | undefined;
    }> {
        let patchedSubscriptionSettings = subscriptionSettings;

        try {
            let hostsOverrides: ExternalSquadEntity['hostOverrides'] | undefined = undefined;

            if (externalSquadUuid !== null && externalSquadUuid !== undefined) {
                const externalSquadSubscriptionSettings = await this.queryBus.execute(
                    new GetCachedExternalSquadSettingsQuery(externalSquadUuid),
                );

                if (externalSquadSubscriptionSettings !== null) {
                    patchedSubscriptionSettings = structuredClone(subscriptionSettings);

                    // Host overrides
                    if (hasContent(externalSquadSubscriptionSettings.hostOverrides)) {
                        hostsOverrides = externalSquadSubscriptionSettings.hostOverrides;
                    }

                    // Subscription settings override
                    if (hasContent(externalSquadSubscriptionSettings.subscriptionSettings)) {
                        patchedSubscriptionSettings = {
                            ...patchedSubscriptionSettings,
                            ...externalSquadSubscriptionSettings.subscriptionSettings,
                        };
                    }

                    if (externalSquadSubscriptionSettings.responseHeadersRemove.length > 0) {
                        const headersToRemove = new Set(
                            externalSquadSubscriptionSettings.responseHeadersRemove,
                        );
                        patchedSubscriptionSettings.customResponseHeaders = Object.fromEntries(
                            Object.entries(
                                patchedSubscriptionSettings.customResponseHeaders ?? {},
                            ).filter(([key]) => !headersToRemove.has(key)),
                        );
                    }

                    // Response headers override
                    if (hasContent(externalSquadSubscriptionSettings.responseHeadersAdd)) {
                        patchedSubscriptionSettings.customResponseHeaders = {
                            ...patchedSubscriptionSettings.customResponseHeaders,
                            ...externalSquadSubscriptionSettings.responseHeadersAdd,
                        };
                    }

                    // HWID settings override
                    if (hasContent(externalSquadSubscriptionSettings.hwidSettings)) {
                        patchedSubscriptionSettings.hwidSettings =
                            externalSquadSubscriptionSettings.hwidSettings;
                    }

                    // Custom remarks override
                    if (hasContent(externalSquadSubscriptionSettings.customRemarks)) {
                        patchedSubscriptionSettings.customRemarks =
                            externalSquadSubscriptionSettings.customRemarks;
                    }
                }
            }

            return {
                subscriptionSettings: patchedSubscriptionSettings,
                hostsOverrides,
            };
        } catch (error) {
            this.logger.error(`Error applying external squad overrides: ${error}`);
            return {
                subscriptionSettings: patchedSubscriptionSettings,
                hostsOverrides: undefined,
            };
        }
    }

    private async getUsersWithPagination(
        dto: GetUsersWithPaginationQuery,
    ): Promise<TResult<{ users: UserEntity[]; total: number }>> {
        return this.queryBus.execute<
            GetUsersWithPaginationQuery,
            TResult<{ users: UserEntity[]; total: number }>
        >(new GetUsersWithPaginationQuery(dto.start, dto.size));
    }

    private async checkHwidDeviceLimit(
        user: UserEntity,
        hwidHeaders: HwidHeaders | null,
        hwidSettings: THwidSettings,
        requestIp?: string,
    ): Promise<TResult<IHwidCheckupResult>> {
        try {
            if (user.hwidDeviceLimit === 0) {
                if (hwidHeaders !== null) {
                    await this.usersQueuesService.checkAndUpsertHwidDevice({
                        hwid: hwidHeaders.hwid,
                        userId: user.id.toString(),
                        platform: hwidHeaders.platform,
                        osVersion: hwidHeaders.osVersion,
                        deviceModel: hwidHeaders.deviceModel,
                        userAgent: hwidHeaders.userAgent,
                        requestIp,
                    });

                    const blockedResult = await this.queryBus.execute(
                        new CheckHwidExistsQuery(hwidHeaders.hwid, user.id),
                    );

                    if (
                        blockedResult.isOk &&
                        blockedResult.response.exists &&
                        blockedResult.response.blocked
                    ) {
                        return ok({
                            subscriptionAllowed: false,
                            maxDeviceReached: false,
                            hwidNotSupported: false,
                            limitBypassed: true,
                            deviceBlocked: true,
                        });
                    }
                }
                return ok({
                    subscriptionAllowed: true,
                    maxDeviceReached: false,
                    hwidNotSupported: false,
                    limitBypassed: true,
                    deviceBlocked: false,
                });
            }

            if (hwidHeaders === null) {
                return ok({
                    subscriptionAllowed: false,
                    maxDeviceReached: false,
                    hwidNotSupported: true,
                    limitBypassed: false,
                    deviceBlocked: false,
                });
            }

            const existsResult = await this.queryBus.execute(
                new CheckHwidExistsQuery(hwidHeaders.hwid, user.id),
            );

            if (existsResult.isOk && existsResult.response.exists) {
                await this.usersQueuesService.checkAndUpsertHwidDevice({
                    hwid: hwidHeaders.hwid,
                    userId: user.id.toString(),
                    platform: hwidHeaders.platform,
                    osVersion: hwidHeaders.osVersion,
                    deviceModel: hwidHeaders.deviceModel,
                    userAgent: hwidHeaders.userAgent,
                    requestIp,
                });

                return ok({
                    subscriptionAllowed: !existsResult.response.blocked,
                    maxDeviceReached: false,
                    hwidNotSupported: false,
                    limitBypassed: false,
                    deviceBlocked: !!existsResult.response.blocked,
                });
            }

            const checkupResult = await this.commandBus.execute(
                new CreateWithAdvisoryLockCommand(
                    new HwidUserDeviceEntity({
                        hwid: hwidHeaders.hwid,
                        userId: user.id,
                        platform: hwidHeaders.platform,
                        osVersion: hwidHeaders.osVersion,
                        deviceModel: hwidHeaders.deviceModel,
                        userAgent: hwidHeaders.userAgent,
                        requestIp,
                    }),
                    user.hwidDeviceLimit ?? hwidSettings.fallbackDeviceLimit,
                ),
            );

            if (!checkupResult.isOk) {
                this.logger.error(`Error creating HWID, access forbidden, userId: ${user.id}`);

                return ok({
                    subscriptionAllowed: false,
                    maxDeviceReached: true,
                    hwidNotSupported: false,
                    limitBypassed: false,
                    deviceBlocked: false,
                });
            }

            switch (checkupResult.response.status) {
                case 'CREATED':
                    this.eventEmitter.emit(
                        EVENTS.USER_HWID_DEVICES.ADDED,
                        new UserHwidDeviceEvent(
                            user,
                            checkupResult.response.hwidDevice,
                            EVENTS.USER_HWID_DEVICES.ADDED,
                        ),
                    );
                    break;
                case 'EXISTS':
                    await this.usersQueuesService.checkAndUpsertHwidDevice({
                        hwid: hwidHeaders.hwid,
                        userId: user.id.toString(),
                        platform: hwidHeaders.platform,
                        osVersion: hwidHeaders.osVersion,
                        deviceModel: hwidHeaders.deviceModel,
                        userAgent: hwidHeaders.userAgent,
                        requestIp,
                    });
                    break;
                case 'REGISTRATION_BLOCKED':
                    return ok({
                        subscriptionAllowed: false,
                        maxDeviceReached: false,
                        hwidNotSupported: false,
                        limitBypassed: false,
                        deviceBlocked: false,
                        registrationBlocked: true,
                    });
                case 'LIMIT_REACHED':
                    return ok({
                        subscriptionAllowed: false,
                        maxDeviceReached: true,
                        hwidNotSupported: false,
                        limitBypassed: false,
                        deviceBlocked: false,
                    });
                default:
                    this.logger.error(`Unknown hwid device status: ${checkupResult.response}`);
                    return ok({
                        subscriptionAllowed: false,
                        maxDeviceReached: true,
                        hwidNotSupported: false,
                        limitBypassed: false,
                        deviceBlocked: false,
                    });
            }

            return ok({
                subscriptionAllowed: true,
                maxDeviceReached: false,
                hwidNotSupported: false,
                limitBypassed: false,
                deviceBlocked: false,
            });
        } catch (error) {
            this.logger.error(`Error checking HWID: ${error}`);
            return ok({
                subscriptionAllowed: false,
                maxDeviceReached: true,
                hwidNotSupported: false,
                limitBypassed: false,
                deviceBlocked: false,
            });
        }
    }

    private async checkAndUpsertHwidUserDevice(
        user: UserEntity,
        hwidHeaders: HwidHeaders | null,
        requestIp?: string,
    ): Promise<void> {
        try {
            if (hwidHeaders === null) {
                return;
            }

            await this.usersQueuesService.checkAndUpsertHwidDevice({
                hwid: hwidHeaders.hwid,
                userId: user.id.toString(),
                platform: hwidHeaders.platform,
                osVersion: hwidHeaders.osVersion,
                deviceModel: hwidHeaders.deviceModel,
                userAgent: hwidHeaders.userAgent,
                requestIp,
            });
        } catch (error) {
            this.logger.error(`Error upserting hwid user device: ${error}`);

            return;
        }
    }

    private resolveSubscriptionUrl(shortUuid: string): string {
        return `https://${this.subPublicDomain}/${shortUuid}`;
    }

    private async updateAndReportSubscriptionRequest(args: ISubscriptionRequest): Promise<void> {
        try {
            await this.usersQueuesService.addSubscriptionRequestRecord({
                userId: args.userId.toString(),
                requestAt: new Date(),
                requestIp: args.requestIp,
                userAgent: args.userAgent,
                srrRuleName: args.matchedRuleName,
                srrResponseType: args.matchedResponseType,
            });

            return;
        } catch (error) {
            this.logger.error(`Error updating and reporting subscription request: ${error}`);

            return;
        }
    }

    public async getSubpageConfigByShortUuid(
        shortUuid: string,
        requestHeaders: Record<string, string>,
    ): Promise<TResult<GetSubpageConfigResponseModel>> {
        let subpageConfigUuid: string | null = null;
        let webpageAllowed: boolean = false;

        try {
            const [subpageConfigUuidResult, settingsEntity] = await Promise.all([
                this.queryBus.execute(new GetUserSubpageConfigQuery(shortUuid)),
                this.queryBus.execute(new GetCachedSubscriptionSettingsQuery()),
            ]);

            if (subpageConfigUuidResult.isOk) {
                subpageConfigUuid = subpageConfigUuidResult.response;
            }

            if (settingsEntity && settingsEntity.responseRules) {
                const result = await this.srrMatcher.matchRules(
                    settingsEntity.responseRules,
                    requestHeaders,
                    undefined,
                );

                webpageAllowed = result.matched === true && result.responseType === 'BROWSER';
            }

            return ok(
                new GetSubpageConfigResponseModel({
                    subpageConfigUuid,
                    webpageAllowed,
                }),
            );
        } catch (error) {
            this.logger.error(`Error getting subpage config by short uuid: ${error}`);
            return ok(
                new GetSubpageConfigResponseModel({
                    subpageConfigUuid: null,
                    webpageAllowed: false,
                }),
            );
        }
    }

    public async getConnectionKeysByUserId(
        userId: number,
    ): Promise<TResult<ConnectionKeysResponseModel>> {
        try {
            const userResult = await this.queryBus.execute(
                new GetUserByUniqueFieldQuery(
                    {
                        id: BigInt(userId),
                    },
                    {
                        activeInternalSquads: false,
                    },
                ),
            );

            if (!userResult.isOk) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            const userEntity = userResult.response;

            if (!userEntity) {
                return fail(ERRORS.USER_NOT_FOUND);
            }

            if (
                this.deviceAccess.enabled &&
                (await this.deviceAccess.hasBlockedDevice(userEntity.id))
            )
                return fail(ERRORS.FORBIDDEN);

            let settings = await this.queryBus.execute(new GetCachedSubscriptionSettingsQuery());
            let hostsOverrides: ExternalSquadEntity['hostOverrides'] | undefined;

            if (!settings) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            if (userEntity.externalSquadUuid) {
                const {
                    subscriptionSettings: patchedSubscriptionSettings,
                    hostsOverrides: patchedHostsOverrides,
                } = await this.applyMaybeExternalSquadOverrides(
                    settings,
                    userEntity.externalSquadUuid,
                );

                settings = patchedSubscriptionSettings;
                hostsOverrides = patchedHostsOverrides;
            }

            const allHostsResult = await this.queryBus.execute(
                new GetHostsForUserQuery(userEntity.id, true, true),
            );

            if (!allHostsResult.isOk) return fail(ERRORS.GET_ALL_HOSTS_ERROR);
            const allHosts = allHostsResult.response;

            const enabledHosts = allHosts.filter((h) => !h.isDisabled && !h.isHidden);
            const disabledHosts = allHosts.filter((h) => h.isDisabled && !h.isHidden);
            const hiddenHosts = allHosts.filter((h) => h.isHidden && !h.isDisabled);

            const formatOrSkip = async (hosts: typeof allHosts, allowEmpty: boolean = false) => {
                if (hosts.length === 0 && !allowEmpty) return [];
                return this.resolveProxyConfigService.resolveProxyConfig({
                    subscriptionSettings: settings,
                    hosts,
                    user: userEntity,
                    hostsOverrides,
                });
            };

            const formattedEnabled = await formatOrSkip(enabledHosts, true);
            const formattedDisabled = await formatOrSkip(disabledHosts);
            const formattedHidden = await formatOrSkip(hiddenHosts);

            return ok(
                new ConnectionKeysResponseModel({
                    enabledKeys: this.xrayGeneratorService.generateLinks(formattedEnabled, false),
                    disabledKeys: this.xrayGeneratorService.generateLinks(formattedDisabled, false),
                    hiddenKeys: this.xrayGeneratorService.generateLinks(formattedHidden, false),
                }),
            );
        } catch (error) {
            this.logger.error(`Error getting subscription info: ${error}`);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

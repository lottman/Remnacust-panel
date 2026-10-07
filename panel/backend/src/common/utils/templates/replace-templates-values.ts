import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { TUsersStatus, USERS_STATUS_VALUES } from '@libs/contracts/constants';

import { HostWithRawInbound } from '@modules/hosts/entities/host-with-inbound-tag.entity';
import { SubscriptionSettingsEntity } from '@modules/subscription-settings/entities';
import { UserEntity } from '@modules/users/entities';

import { prettyBytesUtil } from '../bytes';
import { getNextTrafficResetAt } from '../get-next-traffic-reset-at.util';
import { getNextLocationResetAt } from './get-next-location-reset-at';
import { parseTemplate, renderTemplate } from './template-parser';
import { DEFAULT_DATE_FORMAT, TemplateResolvers } from './template-variables';

const USER_STATUS_LABELS = Object.fromEntries(
    USERS_STATUS_VALUES.map((status) => [status, status.charAt(0) + status.slice(1).toLowerCase()]),
) as Record<TUsersStatus, string>;

dayjs.extend(utc);

// Integer arithmetic preserves large counters; fixed units use the panel's 1024 base.
function fixedTraffic(value: bigint, unit: 'MB' | 'GB', withUnit = true): string {
    const divisor = unit === 'MB' ? 1048576n : 1073741824n;
    const rounded = ((value > 0n ? value : 0n) * 1000n + divisor / 2n) / divisor;
    const fraction = (rounded % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
    return `${rounded / 1000n}${fraction ? '.' + fraction : ''}${withUnit ? ` ${unit}` : ''}`;
}

export class TemplateEngine {
    static replace(template: string, resolvers: TemplateResolvers): string {
        return renderTemplate(parseTemplate(template), resolvers);
    }

    static createUserValueMap(
        user: UserEntity,
        subscriptionSettings: SubscriptionSettingsEntity,
        subPublicDomain: string,
        hosts: HostWithRawInbound[] = [],
        currentHost?: HostWithRawInbound,
    ): TemplateResolvers {
        const hostSpeed = (host: HostWithRawInbound): string => {
            const limits = [
                host.serverSpeedLimitMbps,
                ...(host.useTagSpeedLimit === false ? [] : (host.tagTrafficLimits ?? [])).map(
                    (tag) => tag.speedLimitMbps,
                ),
            ].filter(
                (value): value is number =>
                    typeof value === 'number' && Number.isFinite(value) && value > 0,
            );
            return `${limits.length ? Math.min(...limits) : 0} Mbps`;
        };
        const locationValue = (
            kind: 'used' | 'limit' | 'left' | 'reset',
            args: { format?: string } = {},
            unit?: 'MB' | 'GB',
            useTag = false,
        ): string => {
            const formatBytes = (value: bigint) =>
                unit ? fixedTraffic(value, unit, false) : prettyBytesUtil(value, true, 3);
            const available = currentHost ? [currentHost] : hosts;
            const seen = new Set<string>();
            return (
                available
                    .flatMap((host) => {
                        const tagQuotas =
                            host.useTagTrafficLimit === false ? [] : (host.tagTrafficLimits ?? []);
                        const hostQuota = {
                            key: `host:${host.uuid}`,
                            label: host.remark,
                            used: BigInt(host.usedBytes ?? 0),
                            limit: host.effectiveLimitBytes ?? host.userTrafficLimitBytes ?? 0n,
                            resetValue: host.trafficLimitResetValue,
                            resetUnit: host.trafficLimitResetUnit as 'DAYS' | 'MONTHS',
                            resetAnchorAt: host.trafficLimitResetAnchorAt,
                        };
                        const groups = useTag && tagQuotas.length
                            ? tagQuotas.map((item) => ({
                                key: `tag:${item.tag}`,
                                label: item.tag,
                                used: item.usedBytes,
                                limit: item.limitBytes,
                                resetValue: item.resetValue,
                                resetUnit: item.resetUnit,
                                resetAnchorAt: item.resetAnchorAt,
                            }))
                            : [hostQuota];
                        return groups
                            .filter((group) => {
                                if (seen.has(group.key)) return false;
                                seen.add(group.key);
                                return true;
                            })
                            .map(
                                ({
                                    label: rawLabel,
                                    used,
                                    limit,
                                    resetValue,
                                    resetUnit,
                                    resetAnchorAt,
                                }) => {
                                    const nextReset =
                                        kind === 'reset' &&
                                        resetValue > 0 &&
                                        limit !== null &&
                                        limit > 0n
                                            ? getNextLocationResetAt(
                                                  resetAnchorAt,
                                                  resetValue,
                                                  resetUnit,
                                              )
                                            : null;
                                    const amount =
                                        kind === 'used'
                                            ? formatBytes(used)
                                            : kind === 'reset'
                                              ? nextReset
                                                  ? dayjs(nextReset)
                                                        .utc()
                                                        .format(args.format || DEFAULT_DATE_FORMAT)
                                                  : '∞'
                                              : kind === 'limit'
                                                ? limit === null || limit === 0n
                                                    ? '∞'
                                                    : formatBytes(limit)
                                                : limit === null || limit === 0n
                                                  ? '∞'
                                                  : formatBytes(limit > used ? limit - used : 0n);
                                    const label =
                                        rawLabel
                                            .replace(/\{\{[^{}]*\}\}/g, '')
                                            .split('')
                                            .map((character) =>
                                                character.charCodeAt(0) < 32 ||
                                                character.charCodeAt(0) === 127
                                                    ? ' '
                                                    : character,
                                            )
                                            .join('')
                                            .trim() || host.address;
                                    return currentHost && groups.length === 1
                                        ? amount
                                        : `${label}: ${amount}`;
                                },
                            );
                    })
                    .join('; ') || '0'
            );
        };
        const trafficLeft = (): bigint => {
            const left = user.trafficLimitBytes - user.userTraffic.usedTrafficBytes;
            return user.trafficLimitBytes === 0n || left < 0n ? 0n : left;
        };

        const nextTrafficResetAt = (): Date | null =>
            getNextTrafficResetAt(user.trafficLimitStrategy, user.createdAt);

        const formatDate = (date: Date | null, args: { format?: string }): string =>
            date ? dayjs(date).format(args.format || DEFAULT_DATE_FORMAT) : '';

        const status =
            user.status === 'DISABLED'
                ? 'DISABLED'
                : user.expireAt <= new Date()
                  ? 'EXPIRED'
                  : user.status;

        return {
            TRAFFICLOCATIONUSEDMB: () => locationValue('used', {}, 'MB'),
            TRAFFICLOCATIONUSEDGB: () => locationValue('used', {}, 'GB'),
            TRAFFICLOCATIONUSEDMBTEG: () => locationValue('used', {}, 'MB', true),
            TRAFFICLOCATIONUSEDGBTEG: () => locationValue('used', {}, 'GB', true),
            TRAFFICLOCATIONLIMITMB: () => locationValue('limit', {}, 'MB'),
            TRAFFICLOCATIONLIMITGB: () => locationValue('limit', {}, 'GB'),
            TRAFFICLOCATIONLIMITMBTEG: () => locationValue('limit', {}, 'MB', true),
            TRAFFICLOCATIONLIMITGBTEG: () => locationValue('limit', {}, 'GB', true),
            TRAFFICLOCATIONLEFTMB: () => locationValue('left', {}, 'MB'),
            TRAFFICLOCATIONLEFTGB: () => locationValue('left', {}, 'GB'),
            TRAFFICLOCATIONLEFTMBTEG: () => locationValue('left', {}, 'MB', true),
            TRAFFICLOCATIONLEFTGBTEG: () => locationValue('left', {}, 'GB', true),
            TRAFFIC_USED_MB: () => fixedTraffic(user.userTraffic.usedTrafficBytes, 'MB'),
            TRAFFIC_USED_GB: () => fixedTraffic(user.userTraffic.usedTrafficBytes, 'GB'),
            TRAFFIC_LEFT_MB: () => fixedTraffic(trafficLeft(), 'MB'),
            TRAFFIC_LEFT_GB: () => fixedTraffic(trafficLeft(), 'GB'),
            TOTAL_TRAFFIC_MB: () => fixedTraffic(user.trafficLimitBytes, 'MB'),
            TOTAL_TRAFFIC_GB: () => fixedTraffic(user.trafficLimitBytes, 'GB'),
            HOST_SPEED: () =>
                currentHost
                    ? hostSpeed(currentHost)
                    : hosts
                          .map(
                              (host) =>
                                  `${host.remark.replace(/\{\{[^}]*\}\}/g, '').trim() || host.uuid}: ${hostSpeed(host)}`,
                          )
                          .join('; ') || '0 Mbps',
            DAYS_LEFT: () => Math.max(0, dayjs(user.expireAt).diff(dayjs(), 'day')),
            TRAFFIC_USED: () => prettyBytesUtil(user.userTraffic.usedTrafficBytes, true, 3),
            TRAFFIC_LEFT: () => prettyBytesUtil(trafficLeft(), true, 3),
            TRAFFICLOCATIONUSE: () => locationValue('used'),
            TRAFFICLOCATIONUSETEG: () => locationValue('used', {}, undefined, true),
            TRAFFICLOCATIONLIMIT: () => locationValue('limit'),
            TRAFFICLOCATIONLIMITTEG: () => locationValue('limit', {}, undefined, true),
            TRAFFICLOCATIONLEFT: () => locationValue('left'),
            TRAFFICLOCATIONLEFTTEG: () => locationValue('left', {}, undefined, true),
            TRAFFICLOCATIONRESETAT: (args) => locationValue('reset', args),
            TRAFFICLOCATIONRESETATTEG: (args) => locationValue('reset', args, undefined, true),
            TOTAL_TRAFFIC: () => prettyBytesUtil(user.trafficLimitBytes, true, 3),
            STATUS: (args) => args[status] ?? USER_STATUS_LABELS[status],
            USERNAME: () => user.username,
            EMAIL: () => user.email || '',
            TELEGRAM_ID: () => user.telegramId?.toString() || '',
            SUBSCRIPTION_URL: () => `https://${subPublicDomain}/${user.shortUuid}`,
            TAG: () => user.tag || '',
            EXPIRE_UNIX: () => dayjs(user.expireAt).unix(),
            SHORT_UUID: () => user.shortUuid,
            ID: () => user.id.toString(),
            TRAFFIC_USED_BYTES: () => user.userTraffic.usedTrafficBytes.toString(),
            TRAFFIC_LEFT_BYTES: () => trafficLeft().toString(),
            TOTAL_TRAFFIC_BYTES: () => user.trafficLimitBytes.toString(),
            RESET_STRATEGY: (args) => args[user.trafficLimitStrategy] ?? user.trafficLimitStrategy,
            LIFETIME_USED_BYTES: () => user.userTraffic.lifetimeUsedTrafficBytes.toString(),
            CREATED_AT_UNIX: () => dayjs(user.createdAt).unix(),
            LAST_TRAFFIC_RESET_AT_UNIX: () =>
                user.lastTrafficResetAt ? dayjs(user.lastTrafficResetAt).unix() : 0,
            LAST_TRAFFIC_RESET_AT: (args) => formatDate(user.lastTrafficResetAt, args),
            NEXT_TRAFFIC_RESET_AT_UNIX: () => {
                const nextResetAt = nextTrafficResetAt();

                return nextResetAt ? dayjs(nextResetAt).unix() : 0;
            },
            NEXT_TRAFFIC_RESET_AT: (args) => formatDate(nextTrafficResetAt(), args),
            SS_HWID_LIMIT: () =>
                (
                    user.hwidDeviceLimit ??
                    subscriptionSettings.hwidSettings.fallbackDeviceLimit ??
                    0
                ).toString(),
            DESCRIPTION: () => user.description ?? '',
        };
    }

    static formatWithUser(
        template: string,
        user: UserEntity,
        subscriptionSettings: SubscriptionSettingsEntity,
        subPublicDomain: string,
        hosts: HostWithRawInbound[] = [],
    ): string {
        return this.replace(
            template,
            this.createUserValueMap(user, subscriptionSettings, subPublicDomain, hosts),
        );
    }
}

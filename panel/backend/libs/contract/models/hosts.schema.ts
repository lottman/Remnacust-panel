import { z } from 'zod';

export const HostDomainRulesSchema = z.object({
    mode: z.enum(['OFF', 'ALLOW_ONLY', 'DENY']).default('OFF'),
    domains: z.array(z.string().trim().min(1).max(253)).max(200).default([]),
});
export type THostDomainRules = z.infer<typeof HostDomainRulesSchema>;

export const HostSniRegenerationSchema = z.object({
    enabled: z.boolean().default(false),
    intervalHours: z.int().min(1).max(8760).default(24),
    pool: z.array(z.string().trim().min(1).max(253)).max(50).default([]),
    rotateShortIds: z.boolean().default(true),
    shortIdLength: z.int().min(4).max(16).default(8),
    shortIdCount: z.int().min(1).max(10).default(1),
    lastRotatedAt: z.string().nullable().default(null),
});
export type THostSniRegeneration = z.infer<typeof HostSniRegenerationSchema>;

import { SUBSCRIPTION_TEMPLATE_TYPE } from '../constants';
import { ALPN, INTERNAL_SQUADS_MODE, MIHOMO_IP_VERSION, SECURITY_LAYERS } from '../constants/hosts';
import { HostMapperSchema } from './host-mapper';

export const HostsSchema = z.object({
    uuid: z.uuid(),
    viewPosition: z.int(),
    remark: z.string(),
    address: z.string(),
    port: z.int(),
    path: z.string().nullable(),
    sni: z.string().nullable(),
    host: z.string().nullable(),
    alpn: z.enum(ALPN).nullable(),
    fingerprint: z.string().nullable(),
    isDisabled: z.boolean(),
    alwaysAvailable: z.boolean().default(false),
    onlyWhenInactive: z.boolean().default(false),
    userTrafficLimitBytes: z.number().nullable(),
    trafficLimitResetValue: z.int().min(0).max(3650),
    trafficLimitResetUnit: z.enum(['DAYS', 'MONTHS']),
    trafficLimitResetAnchorAt: z.string(),
    speedLimitMbps: z.int().min(0).max(10000).nullable(),
    totalSpeedLimitMbps: z.int().min(0).max(10000).nullable().default(null),
    trafficMultiplier: z.number().nullable().default(null),
    serverSpeedLimitMbps: z.int().min(0).max(10000).nullable(),
    useTagTrafficLimit: z.boolean().default(true),
    useTagSpeedLimit: z.boolean().default(true),
    useTagTotalSpeedLimit: z.boolean().default(true),
    domainRules: HostDomainRulesSchema.nullish(),
    sniRegeneration: HostSniRegenerationSchema.nullish(),
    securityLayer: z.enum(SECURITY_LAYERS).default(SECURITY_LAYERS.DEFAULT),
    xhttpExtraParams: z.nullable(z.unknown()),
    muxParams: z.nullable(z.unknown()),
    sockoptParams: z.nullable(z.unknown()),
    finalMask: z.nullable(z.unknown()),

    inbound: z.object({
        configProfileUuid: z.uuid().nullable(),
        configProfileInboundUuid: z.uuid().nullable(),
    }),

    serverDescription: z.string().max(30).nullable(),
    tags: z.array(z.string()).default([]),
    isHidden: z.boolean().default(false),
    overrideSniFromAddress: z.boolean().default(false),
    keepSniBlank: z.boolean().default(false),
    vlessRouteId: z.int().min(0).max(65535).nullable(),
    pinnedPeerCertSha256: z.string().nullable(),
    verifyPeerCertByName: z.string().nullable(),
    shuffleHost: z.boolean(),
    mihomoX25519: z.boolean(),
    mihomoIpVersion: z.enum(MIHOMO_IP_VERSION).nullable(),

    nodes: z.array(z.uuid()),
    xrayJsonTemplateUuid: z.uuid().nullable(),
    excludeFromSubscriptionTypes: z.array(z.enum(SUBSCRIPTION_TEMPLATE_TYPE)),
    mapper: HostMapperSchema,

    internalSquads: z.object({
        mode: z.enum(INTERNAL_SQUADS_MODE),
        squads: z.array(z.uuid()),
    }),
});

export const HostInternalSquadsSchema = z
    .object({
        mode: z.enum(INTERNAL_SQUADS_MODE),
        squads: z.array(z.uuid()),
    })
    .refine((v) => v.mode !== INTERNAL_SQUADS_MODE.ALLOW_ONLY || v.squads.length > 0, {
        error: 'At least one internal squad is required in ALLOW_ONLY mode',
        path: ['squads'],
    });

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostInternalSquadsSchema = exports.HostsSchema = exports.HostSniRegenerationSchema = exports.HostDomainRulesSchema = void 0;
const zod_1 = require("zod");
exports.HostDomainRulesSchema = zod_1.z.object({
    mode: zod_1.z.enum(['OFF', 'ALLOW_ONLY', 'DENY']).default('OFF'),
    domains: zod_1.z.array(zod_1.z.string().trim().min(1).max(253)).max(200).default([]),
});
exports.HostSniRegenerationSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    intervalHours: zod_1.z.int().min(1).max(8760).default(24),
    pool: zod_1.z.array(zod_1.z.string().trim().min(1).max(253)).max(50).default([]),
    rotateShortIds: zod_1.z.boolean().default(true),
    shortIdLength: zod_1.z.int().min(4).max(16).default(8),
    shortIdCount: zod_1.z.int().min(1).max(10).default(1),
    lastRotatedAt: zod_1.z.string().nullable().default(null),
});
const constants_1 = require("../constants");
const hosts_1 = require("../constants/hosts");
const host_mapper_1 = require("./host-mapper");
exports.HostsSchema = zod_1.z.object({
    uuid: zod_1.z.uuid(),
    viewPosition: zod_1.z.int(),
    remark: zod_1.z.string(),
    address: zod_1.z.string(),
    port: zod_1.z.int(),
    path: zod_1.z.string().nullable(),
    sni: zod_1.z.string().nullable(),
    host: zod_1.z.string().nullable(),
    alpn: zod_1.z.enum(hosts_1.ALPN).nullable(),
    fingerprint: zod_1.z.string().nullable(),
    isDisabled: zod_1.z.boolean(),
    alwaysAvailable: zod_1.z.boolean().default(false),
    onlyWhenInactive: zod_1.z.boolean().default(false),
    userTrafficLimitBytes: zod_1.z.number().nullable(),
    trafficLimitResetValue: zod_1.z.int().min(0).max(3650),
    trafficLimitResetUnit: zod_1.z.enum(['DAYS', 'MONTHS']),
    trafficLimitResetAnchorAt: zod_1.z.string(),
    speedLimitMbps: zod_1.z.int().min(0).max(10000).nullable(),
    totalSpeedLimitMbps: zod_1.z.int().min(0).max(10000).nullable().default(null),
    trafficMultiplier: zod_1.z.number().nullable().default(null),
    serverSpeedLimitMbps: zod_1.z.int().min(0).max(10000).nullable(),
    useTagTrafficLimit: zod_1.z.boolean().default(true),
    useTagSpeedLimit: zod_1.z.boolean().default(true),
    useTagTotalSpeedLimit: zod_1.z.boolean().default(true),
    domainRules: exports.HostDomainRulesSchema.nullish(),
    sniRegeneration: exports.HostSniRegenerationSchema.nullish(),
    securityLayer: zod_1.z.enum(hosts_1.SECURITY_LAYERS).default(hosts_1.SECURITY_LAYERS.DEFAULT),
    xhttpExtraParams: zod_1.z.nullable(zod_1.z.unknown()),
    muxParams: zod_1.z.nullable(zod_1.z.unknown()),
    sockoptParams: zod_1.z.nullable(zod_1.z.unknown()),
    finalMask: zod_1.z.nullable(zod_1.z.unknown()),
    inbound: zod_1.z.object({
        configProfileUuid: zod_1.z.uuid().nullable(),
        configProfileInboundUuid: zod_1.z.uuid().nullable(),
    }),
    serverDescription: zod_1.z.string().max(30).nullable(),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    isHidden: zod_1.z.boolean().default(false),
    overrideSniFromAddress: zod_1.z.boolean().default(false),
    keepSniBlank: zod_1.z.boolean().default(false),
    vlessRouteId: zod_1.z.int().min(0).max(65535).nullable(),
    pinnedPeerCertSha256: zod_1.z.string().nullable(),
    verifyPeerCertByName: zod_1.z.string().nullable(),
    shuffleHost: zod_1.z.boolean(),
    mihomoX25519: zod_1.z.boolean(),
    mihomoIpVersion: zod_1.z.enum(hosts_1.MIHOMO_IP_VERSION).nullable(),
    nodes: zod_1.z.array(zod_1.z.uuid()),
    xrayJsonTemplateUuid: zod_1.z.uuid().nullable(),
    excludeFromSubscriptionTypes: zod_1.z.array(zod_1.z.enum(constants_1.SUBSCRIPTION_TEMPLATE_TYPE)),
    mapper: host_mapper_1.HostMapperSchema,
    internalSquads: zod_1.z.object({
        mode: zod_1.z.enum(hosts_1.INTERNAL_SQUADS_MODE),
        squads: zod_1.z.array(zod_1.z.uuid()),
    }),
});
exports.HostInternalSquadsSchema = zod_1.z
    .object({
    mode: zod_1.z.enum(hosts_1.INTERNAL_SQUADS_MODE),
    squads: zod_1.z.array(zod_1.z.uuid()),
})
    .refine((v) => v.mode !== hosts_1.INTERNAL_SQUADS_MODE.ALLOW_ONLY || v.squads.length > 0, {
    error: 'At least one internal squad is required in ALLOW_ONLY mode',
    path: ['squads'],
});

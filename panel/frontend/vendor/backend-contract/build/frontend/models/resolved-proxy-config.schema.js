"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResolvedProxyConfigSchema = exports.ResolvedProxyConfigBaseSchema = exports.ProxyEntryMetadataSchema = exports.SecurityVariantSchema = exports.TransportVariantSchema = exports.ProtocolVariantSchema = exports.RealitySecurityOptionsSchema = exports.TlsSecurityOptionsSchema = exports.HysteriaTransportOptionsSchema = exports.HysteriaProtocolOptionsSchema = exports.KcpTransportOptionsSchema = exports.GrpcTransportOptionsSchema = exports.HttpUpgradeTransportOptionsSchema = exports.WsTransportOptionsSchema = exports.XhttpTransportOptionsSchema = exports.TcpTransportOptionsSchema = exports.ShadowsocksProtocolOptionsSchema = exports.TrojanProtocolOptionsSchema = exports.VlessProtocolOptionsSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
const host_mapper_1 = require("./host-mapper");
exports.VlessProtocolOptionsSchema = zod_1.z.object({
    encryption: zod_1.z.string(),
    id: zod_1.z.string(),
    flow: zod_1.z.enum(['', 'xtls-rprx-vision', 'xtls-rprx-vision-udp443']),
});
exports.TrojanProtocolOptionsSchema = zod_1.z.object({
    password: zod_1.z.string(),
});
exports.ShadowsocksProtocolOptionsSchema = zod_1.z.object({
    method: zod_1.z.string(),
    password: zod_1.z.string(),
    uot: zod_1.z.boolean(),
    uotVersion: zod_1.z.int(),
});
const TcpHeaderNoneSchema = zod_1.z.object({
    type: zod_1.z.literal('none'),
});
const TcpHeaderHttpRequestSchema = zod_1.z.object({
    version: zod_1.z.string().optional(),
    method: zod_1.z.string().optional(),
    path: zod_1.z.array(zod_1.z.string()).optional(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
const TcpHeaderHttpResponseSchema = zod_1.z.object({
    version: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
    reason: zod_1.z.string().optional(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
const TcpHeaderHttpSchema = zod_1.z.object({
    type: zod_1.z.literal('http'),
    request: TcpHeaderHttpRequestSchema.optional(),
    response: TcpHeaderHttpResponseSchema.optional(),
});
const TcpHeaderSchema = zod_1.z.discriminatedUnion('type', [TcpHeaderNoneSchema, TcpHeaderHttpSchema]);
exports.TcpTransportOptionsSchema = zod_1.z.object({
    header: TcpHeaderSchema.nullable(),
});
exports.XhttpTransportOptionsSchema = zod_1.z.object({
    path: zod_1.z.string().nullable(),
    host: zod_1.z.string().nullable(),
    mode: zod_1.z.enum(['auto', 'packet-up', 'stream-up', 'stream-one']),
    extra: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable(),
});
exports.WsTransportOptionsSchema = zod_1.z.object({
    path: zod_1.z.string().nullable(),
    host: zod_1.z.string().nullable(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).nullable(),
    heartbeatPeriod: zod_1.z.number().nullable(),
});
exports.HttpUpgradeTransportOptionsSchema = zod_1.z.object({
    path: zod_1.z.string().nullable(),
    host: zod_1.z.string().nullable(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).nullable(),
});
exports.GrpcTransportOptionsSchema = zod_1.z.object({
    authority: zod_1.z.string().nullable(),
    serviceName: zod_1.z.string().nullable(),
    multiMode: zod_1.z.boolean(),
});
exports.KcpTransportOptionsSchema = zod_1.z.object({
    clientMtu: zod_1.z.int(),
    clientTti: zod_1.z.int(),
    congestion: zod_1.z.boolean(),
});
exports.HysteriaProtocolOptionsSchema = zod_1.z.object({
    version: zod_1.z.int(),
});
exports.HysteriaTransportOptionsSchema = zod_1.z.object({
    version: zod_1.z.int(),
    auth: zod_1.z.string(),
});
exports.TlsSecurityOptionsSchema = zod_1.z.object({
    pinnedPeerCertSha256: zod_1.z.string().nullable(),
    verifyPeerCertByName: zod_1.z.string().nullable(),
    alpn: zod_1.z.string().nullable(),
    enableSessionResumption: zod_1.z.boolean(),
    fingerprint: zod_1.z.string().nullable(),
    serverName: zod_1.z.string().nullable(),
    echConfigList: zod_1.z.string().nullable(),
    echForceQuery: zod_1.z.string().nullable(),
    echSockopt: zod_1.z.nullable(zod_1.z.unknown()),
    cipherSuites: zod_1.z.string().nullable(),
});
exports.RealitySecurityOptionsSchema = zod_1.z.object({
    fingerprint: zod_1.z.string(),
    publicKey: zod_1.z.string(),
    shortId: zod_1.z.string().nullable(),
    serverName: zod_1.z.string(),
    spiderX: zod_1.z.string().nullable(),
    mldsa65Verify: zod_1.z.string().nullable(),
});
const VlessProtocolSchema = zod_1.z.object({
    protocol: zod_1.z.literal('vless'),
    protocolOptions: exports.VlessProtocolOptionsSchema,
});
const TrojanProtocolSchema = zod_1.z.object({
    protocol: zod_1.z.literal('trojan'),
    protocolOptions: exports.TrojanProtocolOptionsSchema,
});
const ShadowsocksProtocolSchema = zod_1.z.object({
    protocol: zod_1.z.literal('shadowsocks'),
    protocolOptions: exports.ShadowsocksProtocolOptionsSchema,
});
const HysteriaProtocolSchema = zod_1.z.object({
    protocol: zod_1.z.literal('hysteria'),
    protocolOptions: exports.HysteriaProtocolOptionsSchema,
});
exports.ProtocolVariantSchema = zod_1.z.discriminatedUnion('protocol', [
    VlessProtocolSchema.meta({ title: 'vless' }),
    zod_1.z.object({ protocol: zod_1.z.literal('masque'), protocolOptions: zod_1.z.object({ username: zod_1.z.string(), password: zod_1.z.string(), remoteDNS: zod_1.z.array(zod_1.z.string()) }) }).meta({ title: 'masque' }),
    TrojanProtocolSchema.meta({ title: 'trojan' }),
    ShadowsocksProtocolSchema.meta({ title: 'shadowsocks' }),
    HysteriaProtocolSchema.meta({ title: 'hysteria' }),
]);
const TcpTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('tcp'),
    transportOptions: exports.TcpTransportOptionsSchema,
});
const XHttpTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('xhttp'),
    transportOptions: exports.XhttpTransportOptionsSchema,
});
const WsTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('ws'),
    transportOptions: exports.WsTransportOptionsSchema,
});
const HttpUpgradeTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('httpupgrade'),
    transportOptions: exports.HttpUpgradeTransportOptionsSchema,
});
const GrpcTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('grpc'),
    transportOptions: exports.GrpcTransportOptionsSchema,
});
const KcpTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('kcp'),
    transportOptions: exports.KcpTransportOptionsSchema,
});
const HysteriaTransportSchema = zod_1.z.object({
    transport: zod_1.z.literal('hysteria'),
    transportOptions: exports.HysteriaTransportOptionsSchema,
});
exports.TransportVariantSchema = zod_1.z.discriminatedUnion('transport', [
    TcpTransportSchema.meta({ title: 'tcp' }),
    ...['masque', 'xdrive'].map((transport) => zod_1.z.object({ transport: zod_1.z.literal(transport), transportOptions: zod_1.z.object({ settings: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()) }) }).meta({ title: transport })),
    XHttpTransportSchema.meta({ title: 'xhttp' }),
    zod_1.z.object({ transport: zod_1.z.literal('xera-http'), transportOptions: zod_1.z.object({ settings: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()) }) }).meta({ title: 'xera-http' }),
    WsTransportSchema.meta({ title: 'ws' }),
    HttpUpgradeTransportSchema.meta({ title: 'httpupgrade' }),
    GrpcTransportSchema.meta({ title: 'grpc' }),
    KcpTransportSchema.meta({ title: 'kcp' }),
    HysteriaTransportSchema.meta({ title: 'hysteria' }),
]);
const TlsSecuritySchema = zod_1.z.object({
    security: zod_1.z.literal('tls'),
    securityOptions: exports.TlsSecurityOptionsSchema,
});
const RealitySecuritySchema = zod_1.z.object({
    security: zod_1.z.literal('reality'),
    securityOptions: exports.RealitySecurityOptionsSchema,
});
const NoneSecuritySchema = zod_1.z.object({
    security: zod_1.z.literal('none'),
});
exports.SecurityVariantSchema = zod_1.z.discriminatedUnion('security', [
    TlsSecuritySchema.meta({ title: 'tls' }),
    RealitySecuritySchema.meta({ title: 'reality' }),
    NoneSecuritySchema.meta({ title: 'none' }),
]);
exports.ProxyEntryMetadataSchema = zod_1.z.object({
    uuid: zod_1.z.uuid(),
    tags: zod_1.z.array(zod_1.z.string()),
    excludeFromSubscriptionTypes: zod_1.z.array(zod_1.z.enum(constants_1.SUBSCRIPTION_TEMPLATE_TYPE)),
    inboundTag: zod_1.z.string(),
    configProfileUuid: zod_1.z.uuid().nullable(),
    configProfileInboundUuid: zod_1.z.uuid().nullable(),
    isDisabled: zod_1.z.boolean(),
    isHidden: zod_1.z.boolean(),
    viewPosition: zod_1.z.int(),
    remark: zod_1.z.string(),
    vlessRouteId: zod_1.z.int().nullable(),
    rawInbound: zod_1.z.nullable(zod_1.z.unknown()),
});
exports.ResolvedProxyConfigBaseSchema = zod_1.z.object({
    finalRemark: zod_1.z.string(),
    address: zod_1.z.string(),
    port: zod_1.z.int().positive(),
    streamOverrides: zod_1.z.object({
        finalMask: zod_1.z.nullable(zod_1.z.unknown()),
        sockopt: zod_1.z.nullable(zod_1.z.unknown()),
    }),
    mux: zod_1.z.nullable(zod_1.z.unknown()),
    clientOverrides: zod_1.z.object({
        shuffleHost: zod_1.z.boolean(),
        mihomoX25519: zod_1.z.boolean(),
        mihomoIpVersion: zod_1.z.enum(constants_1.MIHOMO_IP_VERSION).nullable(),
        serverDescription: zod_1.z.string().nullable(),
        xrayJsonTemplate: zod_1.z.nullable(zod_1.z.unknown()),
        mapper: host_mapper_1.HostMapperSchema,
    }),
    metadata: exports.ProxyEntryMetadataSchema,
});
exports.ResolvedProxyConfigSchema = exports.ResolvedProxyConfigBaseSchema.and(exports.ProtocolVariantSchema)
    .and(exports.TransportVariantSchema)
    .and(exports.SecurityVariantSchema);

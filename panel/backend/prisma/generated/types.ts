import type { ColumnType } from "kysely";
export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type Admin = {
    uuid: Generated<string>;
    username: string;
    passwordHash: string;
    role: string;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type ApiTokens = {
    uuid: Generated<string>;
    name: string;
    expireAt: Timestamp;
    scopes: Generated<string[]>;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type ConfigProfileInbounds = {
    uuid: Generated<string>;
    profileUuid: string;
    tag: string;
    type: string;
    network: string | null;
    security: string | null;
    port: number | null;
    rawInbound: object | null;
};
export type ConfigProfileInboundsToNodes = {
    configProfileInboundUuid: string;
    nodeUuid: string;
};
export type ConfigProfileRevisions = {
    uuid: Generated<string>;
    profileUuid: string;
    name: string;
    config: object;
    createdAt: Generated<Timestamp>;
};
export type ConfigProfiles = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    name: string;
    tags: Generated<string[]>;
    config: object;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type ConfigProfileSnippets = {
    name: string;
    snippet: object;
    createdAt: Generated<Timestamp>;
};
export type ExternalSquads = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    name: string;
    tags: Generated<string[]>;
    subscriptionSettings: object | null;
    hostOverrides: object | null;
    responseHeadersAdd: Generated<object>;
    responseHeadersRemove: Generated<string[]>;
    hwidSettings: object | null;
    customRemarks: object | null;
    subpageConfigUuid: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type ExternalSquadsTemplates = {
    externalSquadUuid: string;
    templateUuid: string;
    templateType: string;
};
export type Hosts = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    remark: string;
    address: string;
    port: number;
    path: string | null;
    sni: string | null;
    host: string | null;
    alpn: string | null;
    fingerprint: string | null;
    securityLayer: Generated<string>;
    xhttpExtraParams: object | null;
    muxParams: object | null;
    sockoptParams: object | null;
    finalMask: object | null;
    alwaysAvailable: Generated<boolean>;
    onlyWhenInactive: Generated<boolean>;
    isDisabled: Generated<boolean>;
    serverDescription: string | null;
    vlessRouteId: number | null;
    pinnedPeerCertSha256: string | null;
    verifyPeerCertByName: string | null;
    shuffleHost: Generated<boolean>;
    mihomoX25519: Generated<boolean>;
    mihomoIpVersion: string | null;
    xrayJsonTemplateUuid: string | null;
    keepSniBlank: Generated<boolean>;
    excludeFromSubscriptionTypes: Generated<string[]>;
    mapper: Generated<object>;
    userTrafficLimitBytes: bigint | null;
    trafficLimitResetValue: Generated<number>;
    trafficLimitResetUnit: Generated<string>;
    trafficLimitResetAnchorAt: Generated<Timestamp>;
    speedLimitMbps: number | null;
    totalSpeedLimitMbps: number | null;
    trafficMultiplier: number | null;
    serverSpeedLimitMbps: number | null;
    useTagTrafficLimit: Generated<boolean>;
    useTagSpeedLimit: Generated<boolean>;
    useTagTotalSpeedLimit: Generated<boolean>;
    domainRules: object | null;
    sniRegeneration: object | null;
    internalSquadsMode: Generated<string>;
    tags: Generated<string[]>;
    isHidden: Generated<boolean>;
    overrideSniFromAddress: Generated<boolean>;
    configProfileUuid: string | null;
    configProfileInboundUuid: string | null;
};
export type HostsToNodes = {
    hostUuid: string;
    nodeUuid: string;
};
export type HwidUserDevices = {
    hwid: string;
    userId: bigint;
    platform: string | null;
    osVersion: string | null;
    deviceModel: string | null;
    userAgent: string | null;
    requestIp: string | null;
    blocked: Generated<boolean>;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type InfraBillingHistory = {
    uuid: Generated<string>;
    providerUuid: string;
    amount: number;
    billedAt: Timestamp;
};
export type InfraBillingNodes = {
    uuid: Generated<string>;
    nodeUuid: string | null;
    name: string | null;
    providerUuid: string;
    nextBillingAt: Timestamp;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type InfraProviders = {
    uuid: Generated<string>;
    name: string;
    faviconLink: string | null;
    loginUrl: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type Integrations = {
    uuid: Generated<string>;
    name: string;
    description: string | null;
    config: object;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type InternalSquadHostLinks = {
    hostUuid: string;
    squadUuid: string;
};
export type InternalSquadInbounds = {
    internalSquadUuid: string;
    inboundUuid: string;
};
export type InternalSquadMembers = {
    internalSquadUuid: string;
    userId: bigint;
};
export type InternalSquads = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    name: string;
    tags: Generated<string[]>;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type Keygen = {
    uuid: Generated<string>;
    privKey: string;
    pubKey: string;
    caCert: string | null;
    caKey: string | null;
    clientCert: string | null;
    clientKey: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type NodeHealthLogs = {
    id: Generated<bigint>;
    nodeUuid: string;
    checkedAt: Generated<Timestamp>;
    status: string;
    attempt: Generated<number>;
    message: string | null;
    metrics: Generated<object>;
};
export type NodeHealthLogSettings = {
    id: Generated<number>;
    retentionDays: Generated<number>;
};
export type NodeMeta = {
    nodeId: bigint;
    metadata: object;
};
export type NodePlugin = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    name: string;
    tags: Generated<string[]>;
    pluginConfig: object;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type Nodes = {
    id: Generated<bigint>;
    uuid: Generated<string>;
    name: string;
    address: string;
    port: number | null;
    proxyUrl: string | null;
    activeConfigProfileUuid: string | null;
    activePluginUuid: string | null;
    isConnected: Generated<boolean>;
    isConnecting: Generated<boolean>;
    isDisabled: Generated<boolean>;
    lastStatusChange: Timestamp | null;
    lastStatusMessage: string | null;
    note: string | null;
    consumptionMultiplier: Generated<bigint>;
    nodeConsumptionMultiplier: Generated<bigint>;
    isTrafficTrackingActive: Generated<boolean>;
    trafficResetDay: Generated<number | null>;
    trafficLimitBytes: Generated<bigint | null>;
    trafficUsedBytes: Generated<bigint | null>;
    notifyPercent: Generated<number | null>;
    /**
     * [NodeIps]
     */
    ips: Generated<object>;
    providerUuid: string | null;
    viewPosition: Generated<number>;
    countryCode: Generated<string>;
    tags: Generated<string[]>;
    integrationUuids: Generated<string[]>;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type NodesUsageHistory = {
    nodeUuid: string;
    downloadBytes: bigint;
    uploadBytes: bigint;
    totalBytes: bigint;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type NodesUserUsageHistory = {
    nodeId: bigint;
    userId: bigint;
    totalBytes: bigint;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type Passkeys = {
    id: string;
    adminUuid: string;
    publicKey: Buffer;
    counter: bigint;
    deviceType: string;
    backedUp: boolean;
    transports: string | null;
    passkeyProvider: string | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type RemnawaveSettings = {
    id: Generated<number>;
    /**
     * [PasskeySettings]
     */
    passkeySettings: object | null;
    /**
     * [Oauth2Settings]
     */
    oauth2Settings: object | null;
    /**
     * [PasswordAuthSettings]
     */
    passwordSettings: object | null;
    /**
     * [BrandingSettings]
     */
    brandingSettings: object | null;
    /**
     * [BackupSettings]
     */
    backupSettings: object | null;
};
export type SharedLists = {
    name: string;
    config: object;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type SubscriptionPageConfig = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    name: string;
    tags: Generated<string[]>;
    config: object;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type SubscriptionSettings = {
    uuid: Generated<string>;
    serveJsonAtBaseSubscription: Generated<boolean>;
    isShowCustomRemarks: Generated<boolean>;
    customRemarks: object;
    customResponseHeaders: object | null;
    randomizeHosts: Generated<boolean>;
    responseRules: object | null;
    hwidSettings: object | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type SubscriptionTemplate = {
    uuid: Generated<string>;
    viewPosition: Generated<number>;
    name: Generated<string>;
    tags: Generated<string[]>;
    templateType: string;
    templateYaml: string | null;
    templateJson: object | null;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type TorrentBlockerReports = {
    id: Generated<bigint>;
    userId: bigint;
    nodeId: bigint;
    report: object;
    createdAt: Generated<Timestamp>;
};
export type UserMeta = {
    userId: bigint;
    metadata: object;
};
export type Users = {
    id: Generated<bigint>;
    shortUuid: string;
    username: string;
    /**
     * @kyselyType('ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED')
     */
    status: Generated<'ACTIVE' | 'DISABLED' | 'LIMITED' | 'EXPIRED'>;
    trafficLimitBytes: Generated<bigint>;
    /**
     * @kyselyType('NO_RESET' | 'DAY' | 'WEEK' | 'MONTH' | 'MONTH_ROLLING')
     */
    trafficLimitStrategy: Generated<'NO_RESET' | 'DAY' | 'WEEK' | 'MONTH' | 'MONTH_ROLLING'>;
    expireAt: Timestamp;
    lastTrafficResetAt: Timestamp | null;
    subRevokedAt: Timestamp | null;
    trojanPassword: string;
    vlessUuid: string;
    ssPassword: string;
    description: string | null;
    tag: string | null;
    telegramId: bigint | null;
    email: string | null;
    hwidDeviceLimit: number | null;
    externalSquadUuid: string | null;
    lastTriggeredThreshold: Generated<number>;
    createdAt: Generated<Timestamp>;
    updatedAt: Generated<Timestamp>;
};
export type UserSubscriptionRequestHistory = {
    id: Generated<bigint>;
    userId: bigint;
    requestIp: string | null;
    userAgent: string | null;
    srrRuleName: string | null;
    srrResponseType: Generated<string>;
    requestAt: Generated<Timestamp>;
};
export type UserTraffic = {
    id: bigint;
    usedTrafficBytes: Generated<bigint>;
    lifetimeUsedTrafficBytes: Generated<bigint>;
    onlineAt: Timestamp | null;
    lastConnectedNodeUuid: string | null;
    firstConnectedAt: Timestamp | null;
};
export type XeraNodeOptimization = {
    nodeUuid: string;
    level: string | null;
    verifiedAt: Timestamp | null;
    checkedAt: Generated<Timestamp>;
    verified: Generated<boolean>;
};
export type XeraQuotaUsage = {
    nodeId: bigint;
    userId: bigint;
    createdAt: Timestamp;
    totalBytes: bigint;
};
export type DB = {
    admin: Admin;
    apiTokens: ApiTokens;
    configProfileInbounds: ConfigProfileInbounds;
    configProfileInboundsToNodes: ConfigProfileInboundsToNodes;
    configProfileRevisions: ConfigProfileRevisions;
    configProfileSnippets: ConfigProfileSnippets;
    configProfiles: ConfigProfiles;
    externalSquads: ExternalSquads;
    externalSquadsTemplates: ExternalSquadsTemplates;
    hosts: Hosts;
    hostsToNodes: HostsToNodes;
    hwidUserDevices: HwidUserDevices;
    infraBillingHistory: InfraBillingHistory;
    infraBillingNodes: InfraBillingNodes;
    infraProviders: InfraProviders;
    integrations: Integrations;
    internalSquadHostLinks: InternalSquadHostLinks;
    internalSquadInbounds: InternalSquadInbounds;
    internalSquadMembers: InternalSquadMembers;
    internalSquads: InternalSquads;
    keygen: Keygen;
    nodeMeta: NodeMeta;
    nodePlugin: NodePlugin;
    nodes: Nodes;
    nodesUsageHistory: NodesUsageHistory;
    nodesUserUsageHistory: NodesUserUsageHistory;
    passkeys: Passkeys;
    remnawaveSettings: RemnawaveSettings;
    sharedLists: SharedLists;
    subscriptionPageConfig: SubscriptionPageConfig;
    subscriptionSettings: SubscriptionSettings;
    subscriptionTemplates: SubscriptionTemplate;
    torrentBlockerReports: TorrentBlockerReports;
    userMeta: UserMeta;
    userSubscriptionRequestHistory: UserSubscriptionRequestHistory;
    userTraffic: UserTraffic;
    users: Users;
    xeraNodeHealthLogSettings: NodeHealthLogSettings;
    xeraNodeHealthLogs: NodeHealthLogs;
    xeraNodeOptimization: XeraNodeOptimization;
    xeraQuotaUsage: XeraQuotaUsage;
};

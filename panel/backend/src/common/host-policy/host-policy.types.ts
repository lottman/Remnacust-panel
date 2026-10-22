export type PolicyHost = {
    uuid: string;
    tags: string[];
    inboundUuid: string | null;
    inboundTag: string | null;
    profileUuid: string | null;
    nodes: string[];
    boundNodes: string[];
    alwaysAvailable: boolean;
    onlyWhenInactive: boolean;
    userLimit: string | null;
    trafficMultiplier: number | null;
    userSpeed: number | null;
    deviceSpeed?: number | null;
    totalSpeed: number | null;
    anchor: Date;
    resetValue: number;
    resetUnit: string;
    domains: { mode: 'OFF' | 'ALLOW_ONLY' | 'DENY'; domains: string[] } | null;
    useTagTrafficLimit?: boolean;
    useTagSpeedLimit?: boolean;
    useTagDeviceSpeedLimit?: boolean;
    useTagTotalSpeedLimit?: boolean;
    issued: boolean;
    managed?: boolean;
};
export type PolicyIdentity = {
    userId: string;
    expireAt?: Date;
    hostUuid: string;
    hwid: string | null;
    parent: string;
    allowed: boolean;
    rawInbound: Record<string, any>;
    inboundTag: string;
    profileUuid: string;
};
export type PolicyGroup = {
    key: string;
    hostUuids: string[];
    nodeUuids: string[];
    userLimit: string | null;
    trafficMultiplier: number;
    userSpeed: number | null;
    deviceSpeed?: number | null;
    totalSpeed: number | null;
    anchor: Date;
    resetValue: number;
    resetUnit: string;
};
export type PolicySnapshot = {
    hosts: PolicyHost[];
    groups: PolicyGroup[];
    identities: PolicyIdentity[];
    protectedInboundIds: Set<string>;
    users?: PolicyUser[];
    consumptionMultiplier?: string;
};

export type PolicyUser = {
    userId: string;
    allowed: boolean;
    expireAt: Date;
    limit: string;
};

export type PolicyTag = Omit<PolicyGroup, 'key' | 'hostUuids' | 'nodeUuids'> & { tag: string };

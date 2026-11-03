import type { XrayTemplateVariant } from '../utils/xray-template-assignments';

import { HostsEntity } from './hosts.entity';

type HostWithRawInboundConstructorData = {
    rawInbound: object | null;
    inboundTag: string;
    xrayJsonTemplate: object | null;
    xrayJsonVariants?: XrayTemplateVariant[];
} & ConstructorParameters<typeof HostsEntity>[0];

export class HostWithRawInbound extends HostsEntity {
    public rawInbound: object | null;
    public inboundTag: string;
    public xrayJsonTemplate: object | null;
    public xrayJsonVariants?: XrayTemplateVariant[];
    public usedBytes: number | bigint | string | null;
    public ambiguousTraffic = false;
    public trafficPaused = false;
    public effectiveLimitBytes?: bigint;
    public tagTrafficLimits: {
        tag: string;
        speedLimitMbps?: number | null;
        limitBytes: bigint;
        usedBytes: bigint;
        ambiguous: boolean;
        paused?: boolean;
        resetValue: number;
        resetUnit: 'DAYS' | 'MONTHS';
        resetAnchorAt: Date;
    }[] = [];

    constructor(data: HostWithRawInboundConstructorData) {
        super(data);

        this.rawInbound = data.rawInbound;
        this.inboundTag = data.inboundTag;
        this.xrayJsonTemplate = data.xrayJsonTemplate;
        this.xrayJsonVariants = data.xrayJsonVariants;
    }
}

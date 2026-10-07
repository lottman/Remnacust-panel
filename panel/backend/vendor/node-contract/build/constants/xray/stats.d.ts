export declare const XRAY_DEFAULT_POLICY_MODEL: {
    readonly policy: {
        readonly levels: {
            readonly '0': {
                readonly statsUserUplink: true;
                readonly statsUserDownlink: true;
                readonly statsUserOnline: true;
            };
        };
        readonly system: {
            readonly statsInboundDownlink: true;
            readonly statsInboundUplink: true;
            readonly statsOutboundDownlink: true;
            readonly statsOutboundUplink: true;
        };
    };
};
export declare const XRAY_DEFAULT_STATS_MODEL: {
    readonly stats: {};
};
export declare const XRAY_DEFAULT_API_MODEL: {
    readonly api: {
        readonly services: readonly ["HandlerService", "StatsService", "RoutingService"];
        readonly tag: "REMNAWAVE_API";
    };
};
export declare const XRAY_API_INBOUND_MODEL: ({ xtlsApiSocketPath }: {
    xtlsApiSocketPath: string;
}) => {
    readonly tag: "REMNAWAVE_API_INBOUND";
    readonly listen: `@${string}`;
    readonly protocol: "tunnel";
};
export declare const XRAY_ROUTING_RULES_MODEL: {
    readonly inboundTag: readonly ["REMNAWAVE_API_INBOUND"];
    readonly outboundTag: "REMNAWAVE_API";
};
export declare const XRAY_TORRENT_BLOCKER_ROUTING_RULES_MODEL: ({ webhookUrl, }: {
    webhookUrl: string;
}) => {
    protocol: string[];
    outboundTag: string;
    webhook: {
        url: string;
        deduplication: number;
    };
};
export declare const XRAY_TORRENT_BLOCKER_OUTBOUND_MODEL: {
    readonly tag: "RW_TB_OUTBOUND_BLOCK";
    readonly protocol: "blackhole";
};
export declare const XRAY_TORRENT_BLOCKER_OUTBOUND_TAG = "RW_TB_OUTBOUND_BLOCK";
//# sourceMappingURL=stats.d.ts.map
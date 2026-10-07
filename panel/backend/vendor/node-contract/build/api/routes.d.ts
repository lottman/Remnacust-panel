export declare const ROOT: "/node";
export declare const REST_API: {
    readonly XRAY: {
        readonly START: "/node/xray/start";
        readonly STOP: "/node/xray/stop";
        readonly NODE_HEALTH_CHECK: "/node/xray/healthcheck";
        readonly LOGS: "/node/xray/logs";
    };
    readonly STATS: {
        readonly GET_USER_ONLINE_STATUS: "/node/stats/get-user-online-status";
        readonly GET_USERS_STATS: "/node/stats/get-users-stats";
        readonly GET_SYSTEM_STATS: "/node/stats/get-system-stats";
        readonly GET_INBOUND_STATS: "/node/stats/get-inbound-stats";
        readonly GET_OUTBOUND_STATS: "/node/stats/get-outbound-stats";
        readonly GET_ALL_OUTBOUNDS_STATS: "/node/stats/get-all-outbounds-stats";
        readonly GET_ALL_INBOUNDS_STATS: "/node/stats/get-all-inbounds-stats";
        readonly GET_COMBINED_STATS: "/node/stats/get-combined-stats";
        readonly GET_USER_IP_LIST: "/node/stats/get-user-ip-list";
        readonly GET_USERS_IP_LIST: "/node/stats/get-users-ip-list";
        readonly GET_GEOCHECK: "/node/stats/get-geocheck";
    };
    readonly HANDLER: {
        readonly ADD_USER: "/node/handler/add-user";
        readonly REMOVE_USER: "/node/handler/remove-user";
        readonly ADD_USERS: "/node/handler/add-users";
        readonly REMOVE_USERS: "/node/handler/remove-users";
        readonly DROP_USERS_CONNECTIONS: "/node/handler/drop-users-connections";
        readonly DROP_IPS: "/node/handler/drop-ips";
    };
    readonly PLUGIN: {
        readonly SYNC: "/node/plugin/sync";
        readonly TORRENT_BLOCKER: {
            readonly COLLECT: "/node/plugin/torrent-blocker/collect";
        };
        readonly NFTABLES: {
            readonly UNBLOCK_IPS: "/node/plugin/nftables/unblock-ips";
            readonly BLOCK_IPS: "/node/plugin/nftables/block-ips";
            readonly RECREATE_TABLES: "/node/plugin/nftables/recreate-tables";
        };
    };
};
//# sourceMappingURL=routes.d.ts.map
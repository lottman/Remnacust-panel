"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XRAY_TORRENT_BLOCKER_OUTBOUND_TAG = exports.XRAY_TORRENT_BLOCKER_OUTBOUND_MODEL = exports.XRAY_TORRENT_BLOCKER_ROUTING_RULES_MODEL = exports.XRAY_ROUTING_RULES_MODEL = exports.XRAY_API_INBOUND_MODEL = exports.XRAY_DEFAULT_API_MODEL = exports.XRAY_DEFAULT_STATS_MODEL = exports.XRAY_DEFAULT_POLICY_MODEL = void 0;
exports.XRAY_DEFAULT_POLICY_MODEL = {
    policy: {
        levels: {
            '0': {
                statsUserUplink: true,
                statsUserDownlink: true,
                statsUserOnline: true,
            },
        },
        system: {
            statsInboundDownlink: true,
            statsInboundUplink: true,
            statsOutboundDownlink: true,
            statsOutboundUplink: true,
        },
    },
};
exports.XRAY_DEFAULT_STATS_MODEL = {
    stats: {},
};
exports.XRAY_DEFAULT_API_MODEL = {
    api: {
        services: ['HandlerService', 'StatsService', 'RoutingService'],
        tag: 'REMNAWAVE_API',
    },
};
const XRAY_API_INBOUND_MODEL = ({ xtlsApiSocketPath }) => ({
    tag: 'REMNAWAVE_API_INBOUND',
    listen: `@${xtlsApiSocketPath}`,
    protocol: 'tunnel',
});
exports.XRAY_API_INBOUND_MODEL = XRAY_API_INBOUND_MODEL;
exports.XRAY_ROUTING_RULES_MODEL = {
    inboundTag: ['REMNAWAVE_API_INBOUND'],
    outboundTag: 'REMNAWAVE_API',
};
const XRAY_TORRENT_BLOCKER_ROUTING_RULES_MODEL = ({ webhookUrl, }) => ({
    protocol: ['bittorrent'],
    outboundTag: 'RW_TB_OUTBOUND_BLOCK',
    webhook: {
        url: webhookUrl,
        deduplication: 5,
    },
});
exports.XRAY_TORRENT_BLOCKER_ROUTING_RULES_MODEL = XRAY_TORRENT_BLOCKER_ROUTING_RULES_MODEL;
exports.XRAY_TORRENT_BLOCKER_OUTBOUND_MODEL = {
    tag: 'RW_TB_OUTBOUND_BLOCK',
    protocol: 'blackhole',
};
exports.XRAY_TORRENT_BLOCKER_OUTBOUND_TAG = 'RW_TB_OUTBOUND_BLOCK';

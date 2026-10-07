"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLUGIN_ROUTES = exports.NFTABLES_ROUTE = exports.TORRENT_BLOCKER_ROUTE = exports.PLUGIN_CONTROLLER = void 0;
exports.PLUGIN_CONTROLLER = 'plugin';
exports.TORRENT_BLOCKER_ROUTE = 'torrent-blocker';
exports.NFTABLES_ROUTE = 'nftables';
exports.PLUGIN_ROUTES = {
    SYNC: 'sync',
    TORRENT_BLOCKER: {
        COLLECT: `${exports.TORRENT_BLOCKER_ROUTE}/collect`,
    },
    NFTABLES: {
        UNBLOCK_IPS: `${exports.NFTABLES_ROUTE}/unblock-ips`,
        BLOCK_IPS: `${exports.NFTABLES_ROUTE}/block-ips`,
        RECREATE_TABLES: `${exports.NFTABLES_ROUTE}/recreate-tables`,
    },
};

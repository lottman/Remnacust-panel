"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.REST_API = exports.ROOT = void 0;
const CONTROLLERS = __importStar(require("./controllers"));
exports.ROOT = '/node';
exports.REST_API = {
    XRAY: {
        START: `${exports.ROOT}/${CONTROLLERS.XRAY_CONTROLLER}/${CONTROLLERS.XRAY_ROUTES.START}`,
        STOP: `${exports.ROOT}/${CONTROLLERS.XRAY_CONTROLLER}/${CONTROLLERS.XRAY_ROUTES.STOP}`,
        NODE_HEALTH_CHECK: `${exports.ROOT}/${CONTROLLERS.XRAY_CONTROLLER}/${CONTROLLERS.XRAY_ROUTES.NODE_HEALTH_CHECK}`,
        LOGS: `${exports.ROOT}/${CONTROLLERS.XRAY_CONTROLLER}/${CONTROLLERS.XRAY_ROUTES.LOGS}`,
    },
    STATS: {
        GET_USER_ONLINE_STATUS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_USER_ONLINE_STATUS}`,
        GET_USERS_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_USERS_STATS}`,
        GET_SYSTEM_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_SYSTEM_STATS}`,
        GET_INBOUND_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_INBOUND_STATS}`,
        GET_OUTBOUND_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_OUTBOUND_STATS}`,
        GET_ALL_OUTBOUNDS_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_ALL_OUTBOUNDS_STATS}`,
        GET_ALL_INBOUNDS_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_ALL_INBOUNDS_STATS}`,
        GET_COMBINED_STATS: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_COMBINED_STATS}`,
        GET_USER_IP_LIST: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_USER_IP_LIST}`,
        GET_USERS_IP_LIST: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_USERS_IP_LIST}`,
        GET_GEOCHECK: `${exports.ROOT}/${CONTROLLERS.STATS_CONTROLLER}/${CONTROLLERS.STATS_ROUTES.GET_GEOCHECK}`,
    },
    HANDLER: {
        ADD_USER: `${exports.ROOT}/${CONTROLLERS.HANDLER_CONTROLLER}/${CONTROLLERS.HANDLER_ROUTES.ADD_USER}`,
        REMOVE_USER: `${exports.ROOT}/${CONTROLLERS.HANDLER_CONTROLLER}/${CONTROLLERS.HANDLER_ROUTES.REMOVE_USER}`,
        ADD_USERS: `${exports.ROOT}/${CONTROLLERS.HANDLER_CONTROLLER}/${CONTROLLERS.HANDLER_ROUTES.ADD_USERS}`,
        REMOVE_USERS: `${exports.ROOT}/${CONTROLLERS.HANDLER_CONTROLLER}/${CONTROLLERS.HANDLER_ROUTES.REMOVE_USERS}`,
        DROP_USERS_CONNECTIONS: `${exports.ROOT}/${CONTROLLERS.HANDLER_CONTROLLER}/${CONTROLLERS.HANDLER_ROUTES.DROP_USERS_CONNECTIONS}`,
        DROP_IPS: `${exports.ROOT}/${CONTROLLERS.HANDLER_CONTROLLER}/${CONTROLLERS.HANDLER_ROUTES.DROP_IPS}`,
    },
    PLUGIN: {
        SYNC: `${exports.ROOT}/${CONTROLLERS.PLUGIN_CONTROLLER}/${CONTROLLERS.PLUGIN_ROUTES.SYNC}`,
        TORRENT_BLOCKER: {
            COLLECT: `${exports.ROOT}/${CONTROLLERS.PLUGIN_CONTROLLER}/${CONTROLLERS.PLUGIN_ROUTES.TORRENT_BLOCKER.COLLECT}`,
        },
        NFTABLES: {
            UNBLOCK_IPS: `${exports.ROOT}/${CONTROLLERS.PLUGIN_CONTROLLER}/${CONTROLLERS.PLUGIN_ROUTES.NFTABLES.UNBLOCK_IPS}`,
            BLOCK_IPS: `${exports.ROOT}/${CONTROLLERS.PLUGIN_CONTROLLER}/${CONTROLLERS.PLUGIN_ROUTES.NFTABLES.BLOCK_IPS}`,
            RECREATE_TABLES: `${exports.ROOT}/${CONTROLLERS.PLUGIN_CONTROLLER}/${CONTROLLERS.PLUGIN_ROUTES.NFTABLES.RECREATE_TABLES}`,
        },
    },
};

export interface INodeMetrics {
    nodeUuid: string;
    inbounds: {
        tag: string;
        downlink: string;
        uplink: string;
    }[];
    outbounds: {
        tag: string;
        downlink: string;
        uplink: string;
    }[];
}

export const NODE_METRICS_MESSAGE_CHANNEL = 'ch:node-metrics';

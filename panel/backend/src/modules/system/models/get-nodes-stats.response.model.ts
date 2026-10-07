import { NodeMetrics } from '../interfaces/metrics.interface';

interface IGetNodesStatsResponseData {
    nodes: NodeMetrics[];
}

export class GetNodesStatsResponseModel {
    nodes: NodeMetrics[];

    constructor(data: IGetNodesStatsResponseData) {
        this.nodes = data.nodes;
    }
}

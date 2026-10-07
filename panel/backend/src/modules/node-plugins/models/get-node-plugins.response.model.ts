import { NodePluginEntity } from '../entities';
import { BaseNodePluginResponseModel } from './base-node-plugin.response.model';

export class GetNodePluginsResponseModel {
    public readonly total: number;
    public readonly nodePlugins: BaseNodePluginResponseModel[];

    constructor(entities: NodePluginEntity[], total: number) {
        this.total = total;
        this.nodePlugins = entities.map((plugin) => new BaseNodePluginResponseModel(plugin));
    }
}

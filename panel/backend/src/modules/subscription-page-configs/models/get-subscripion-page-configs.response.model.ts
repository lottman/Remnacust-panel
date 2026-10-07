import { SubscriptionPageConfigEntity } from '../entities/sub-page-config.entity';
import { BaseSubscriptionPageConfigResponseModel } from './base-subpage-config.response.model';

export class GetSubscriptionPageConfigsResponseModel {
    public readonly total: number;
    public readonly configs: BaseSubscriptionPageConfigResponseModel[];

    constructor(entities: SubscriptionPageConfigEntity[], total: number) {
        this.total = total;
        this.configs = entities.map(
            (config) => new BaseSubscriptionPageConfigResponseModel(config),
        );
    }
}

import { BaseSubscriptionRequestHistoryResponseModel } from './base-subscription-request-history.response.model';

export class GetSubscriptionRequestHistoryResponseModel {
    public readonly total: number;
    public readonly records: BaseSubscriptionRequestHistoryResponseModel[];

    constructor(data: GetSubscriptionRequestHistoryResponseModel) {
        this.total = data.total;
        this.records = data.records;
    }
}

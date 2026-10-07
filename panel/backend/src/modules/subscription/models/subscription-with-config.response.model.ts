import { ISubscriptionHeaders } from '../interfaces/subscription-headers.interface';

export class SubscriptionWithConfigResponse {
    headers: ISubscriptionHeaders;
    contentType: string;
    body: string;

    constructor(data: SubscriptionWithConfigResponse) {
        this.headers = data.headers;
        this.contentType = data.contentType;
        this.body = data.body;
    }
}

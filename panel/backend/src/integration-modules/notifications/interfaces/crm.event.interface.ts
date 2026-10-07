import { TCRMEvents } from '@libs/contracts/constants';

interface ICrmEvent {
    providerName: string;
    nodeName: string;
    nextBillingAt: Date;
    loginUrl: string;
}

export class CrmEvent {
    eventName: TCRMEvents;
    data: ICrmEvent;
    skipTelegramNotification?: boolean;

    constructor(data: ICrmEvent, event: TCRMEvents, skipTelegramNotification?: boolean) {
        this.eventName = event;
        this.data = data;
        this.skipTelegramNotification = skipTelegramNotification ?? false;
    }
}

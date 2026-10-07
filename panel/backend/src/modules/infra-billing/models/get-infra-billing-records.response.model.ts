import { InfraBillingHistoryEntity } from '../entities';

export class GetInfraBillingHistoryRecordsResponseModel {
    public readonly records: {
        uuid: string;
        providerUuid: string;
        amount: number;
        billedAt: Date;
        provider: {
            uuid: string;
            name: string;
            faviconLink: string;
        };
    }[];

    public readonly total: number;

    constructor(entities: InfraBillingHistoryEntity[], total: number) {
        this.records = entities.map((record) => ({
            uuid: record.uuid,
            providerUuid: record.providerUuid,
            amount: Number(record.amount.toFixed(2)),
            billedAt: record.billedAt,
            provider: record.provider,
        }));

        this.total = total;
    }
}

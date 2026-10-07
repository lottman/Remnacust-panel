import { InfraProviderEntity } from '../entities';

export class GetInfraProviderByUuidResponseModel {
    public readonly name: string;
    public readonly uuid: string;
    public readonly faviconLink: string | null;
    public readonly loginUrl: string | null;

    public readonly billingHistory: {
        totalAmount: number;
        totalBills: number;
    };
    public readonly billingNodes: {
        name: string;
        details: {
            nodeUuid: string;
            countryCode: string;
        } | null;
    }[];

    public readonly createdAt: Date;
    public readonly updatedAt: Date;

    constructor(entity: InfraProviderEntity) {
        this.uuid = entity.uuid;
        this.name = entity.name;
        this.faviconLink = entity.faviconLink;
        this.loginUrl = entity.loginUrl;

        this.createdAt = entity.createdAt;
        this.updatedAt = entity.updatedAt;

        this.billingHistory = entity.billingHistory;
        this.billingNodes = entity.billingNodes;
    }
}

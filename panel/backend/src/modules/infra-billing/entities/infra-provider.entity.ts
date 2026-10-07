import { InfraProviders } from '@prisma/client';

interface IRawBillingNode {
    name: string;
    nodeUuid: string | null;
    countryCode: string | null;
}

export class InfraProviderEntity implements InfraProviders {
    public name: string;
    public uuid: string;
    public faviconLink: string | null;
    public loginUrl: string | null;

    public createdAt: Date;
    public updatedAt: Date;

    public billingHistory: {
        totalAmount: number;
        totalBills: number;
    };
    public billingNodes: {
        name: string;
        details: {
            nodeUuid: string;
            countryCode: string;
        } | null;
    }[];

    constructor(provider: { billingNodes?: IRawBillingNode[] } & Partial<InfraProviders>) {
        Object.assign(this, provider);

        if (provider.billingNodes) {
            this.billingNodes = provider.billingNodes.map((node) => ({
                name: node.name,
                details:
                    node.nodeUuid && node.countryCode
                        ? { nodeUuid: node.nodeUuid, countryCode: node.countryCode }
                        : null,
            }));
        }

        return this;
    }
}

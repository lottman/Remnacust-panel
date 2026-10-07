import { InfraAvailableBillingNodeEntity, InfraBillingNodeEntity } from '../entities';

interface IStats {
    upcomingNodesCount: number;
    currentMonthPayments: number;
    totalSpent: number;
}

export class GetBillingNodesResponseModel {
    public readonly totalBillingNodes: number;
    public readonly totalAvailableBillingNodes: number;
    public readonly billingNodes: InfraBillingNodeEntity[];
    public readonly availableBillingNodes: InfraAvailableBillingNodeEntity[];
    public readonly stats: IStats;
    constructor(
        billingNodes: InfraBillingNodeEntity[],
        availableBillingNodes: InfraAvailableBillingNodeEntity[],
        totalBillingNodes: number,
        totalAvailableBillingNodes: number,
        stats: IStats,
    ) {
        this.totalBillingNodes = totalBillingNodes;
        this.totalAvailableBillingNodes = totalAvailableBillingNodes;
        this.billingNodes = billingNodes;
        this.availableBillingNodes = availableBillingNodes;
        this.stats = stats;
    }
}

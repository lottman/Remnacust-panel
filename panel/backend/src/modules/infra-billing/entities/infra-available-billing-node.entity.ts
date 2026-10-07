interface IInfraAvailableBillingNode {
    uuid: string;
    name: string;
    countryCode: string;
}

export class InfraAvailableBillingNodeEntity {
    public readonly uuid: string;
    public readonly name: string;
    public readonly countryCode: string;

    constructor(billingNode: IInfraAvailableBillingNode) {
        this.uuid = billingNode.uuid;
        this.name = billingNode.name;
        this.countryCode = billingNode.countryCode;
    }
}

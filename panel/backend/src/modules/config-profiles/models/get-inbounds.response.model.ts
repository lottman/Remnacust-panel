import { ConfigProfileInboundWithSquadsEntity } from '../entities';

export class GetAllInboundsResponseModel {
    public readonly total: number;
    public readonly inbounds: ConfigProfileInboundWithSquadsEntity[];

    constructor(inbounds: ConfigProfileInboundWithSquadsEntity[], total: number) {
        this.total = total;
        this.inbounds = inbounds;
    }
}

import { InfraProviderEntity } from '../entities';

export class GetInfraProvidersResponseModel {
    public readonly total: number;
    public readonly providers: InfraProviderEntity[];

    constructor(providers: InfraProviderEntity[], total: number) {
        this.total = total;
        this.providers = providers;
    }
}

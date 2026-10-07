import { InternalSquadWithInfoEntity } from '../entities';
import { GetInternalSquadByUuidResponseModel } from './get-internal-squad-by-uuid.response.model';

export class GetInternalSquadsResponseModel {
    public readonly total: number;
    public readonly internalSquads: GetInternalSquadByUuidResponseModel[];

    constructor(entities: InternalSquadWithInfoEntity[], total: number) {
        this.total = total;
        this.internalSquads = entities.map(
            (internalSquad) => new GetInternalSquadByUuidResponseModel(internalSquad),
        );
    }
}

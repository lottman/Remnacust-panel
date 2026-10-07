import { ConfigProfileWithInboundsAndNodesEntity } from '../entities';
import { GetConfigProfileByUuidResponseModel } from './get-config-profile-by-uuid.response.model';

export class GetConfigProfilesResponseModel {
    public readonly total: number;
    public readonly configProfiles: GetConfigProfileByUuidResponseModel[];

    constructor(entities: ConfigProfileWithInboundsAndNodesEntity[], total: number) {
        this.total = total;
        this.configProfiles = entities.map(
            (configProfile) => new GetConfigProfileByUuidResponseModel(configProfile),
        );
    }
}

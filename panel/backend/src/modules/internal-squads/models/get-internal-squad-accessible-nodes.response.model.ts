import { IGetSquadAccessibleNodes } from '../interfaces';

export class GetInternalSquadAccessibleNodesResponseModel {
    public readonly squadUuid: string;
    public readonly accessibleNodes: {
        uuid: string;
        nodeName: string;
        countryCode: string;
        configProfileUuid: string;
        configProfileName: string;
        activeInbounds: string[];
    }[];

    constructor(data: IGetSquadAccessibleNodes) {
        this.squadUuid = data.squadUuid;
        this.accessibleNodes = data.accessibleNodes;
    }
}

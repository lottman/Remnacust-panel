import { IGetUserAccessibleNodesResponse } from '../interfaces';

export class GetUserAccessibleNodesResponseModel {
    public readonly userId: number;
    public readonly activeNodes: {
        uuid: string;
        nodeName: string;
        countryCode: string;
        configProfileUuid: string;
        configProfileName: string;
        activeSquads: {
            squadName: string;
            activeInbounds: string[];
        }[];
    }[];

    constructor(data: IGetUserAccessibleNodesResponse, userId: bigint) {
        this.userId = Number(userId);
        this.activeNodes = data.activeNodes;
    }
}

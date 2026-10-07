export interface IGetSquadAccessibleNodes {
    squadUuid: string;
    accessibleNodes: {
        uuid: string;
        nodeName: string;
        countryCode: string;
        configProfileUuid: string;
        configProfileName: string;
        activeInbounds: string[];
    }[];
}

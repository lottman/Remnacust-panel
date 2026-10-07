interface IGetStatsDigestResponseData {
    hwidDevices: {
        createdCount: number;
    };
    traffic: {
        byUsersCreatedInRangeBytes: string;
        totalBytes: string;
    };
    users: {
        createdCount: number;
        expiredCount: number;
    };
}

export class GetStatsDigestResponseModel {
    users: {
        createdCount: number;
        expiredCount: number;
    };
    traffic: {
        byUsersCreatedInRangeBytes: string;
        totalBytes: string;
    };
    hwidDevices: {
        createdCount: number;
    };

    constructor(data: IGetStatsDigestResponseData) {
        this.users = data.users;
        this.traffic = data.traffic;
        this.hwidDevices = data.hwidDevices;
    }
}

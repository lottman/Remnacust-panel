export class GetHwidDevicesStatsResponseModel {
    public readonly byPlatform: Array<{
        platform: string;
        count: number;
        byApp: Array<{ app: string; count: number }>;
    }>;
    public readonly stats: {
        totalUniqueDevices: number;
        totalHwidDevices: number;
        averageHwidDevicesPerUser: number;
    };

    constructor(data: GetHwidDevicesStatsResponseModel) {
        this.byPlatform = data.byPlatform;
        this.stats = data.stats;
    }
}

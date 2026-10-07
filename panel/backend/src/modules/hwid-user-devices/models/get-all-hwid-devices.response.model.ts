import { BaseUserHwidDevicesResponseModel } from './base-user-hwid-devices.response.model';

export class GetAllHwidDevicesResponseModel {
    public readonly total: number;
    public readonly devices: BaseUserHwidDevicesResponseModel[];

    constructor(data: GetAllHwidDevicesResponseModel) {
        this.total = data.total;
        this.devices = data.devices;
    }
}

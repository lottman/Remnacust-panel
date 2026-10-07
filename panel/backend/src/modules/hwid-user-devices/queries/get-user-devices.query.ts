import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import { HwidUserDeviceEntity } from '../entities/hwid-user-device.entity';
import { HwidUserDevicesRepository } from '../repositories/hwid-user-devices.repository';

export class GetUserDevicesQuery extends Query<HwidUserDeviceEntity[]> {
    constructor(public readonly userId: bigint) { super(); }
}

@QueryHandler(GetUserDevicesQuery)
export class GetUserDevicesHandler implements IQueryHandler<GetUserDevicesQuery> {
    constructor(private readonly repository: HwidUserDevicesRepository) {}

    execute(query: GetUserDevicesQuery) {
        return this.repository.findByCriteria({ userId: query.userId });
    }
}

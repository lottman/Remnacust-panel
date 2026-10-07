import { Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';

import { HwidUserDevicesRepository } from '../../repositories/hwid-user-devices.repository';
import { CountDevicesByRangeQuery } from './count-devices-by-range.query';

@QueryHandler(CountDevicesByRangeQuery)
export class CountDevicesByRangeHandler implements IQueryHandler<
    CountDevicesByRangeQuery,
    TResult<number>
> {
    private readonly logger = new Logger(CountDevicesByRangeHandler.name);
    constructor(private readonly hwidUserDevicesRepository: HwidUserDevicesRepository) {}

    async execute(query: CountDevicesByRangeQuery): Promise<TResult<number>> {
        try {
            const count = await this.hwidUserDevicesRepository.countCreatedInRange(
                query.start,
                query.endExclusive,
            );

            return ok(count);
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.INTERNAL_SERVER_ERROR);
        }
    }
}

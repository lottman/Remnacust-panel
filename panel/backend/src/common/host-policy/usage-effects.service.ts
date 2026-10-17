import { Injectable } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { RawCacheService } from '@common/raw-cache';
import {
    CACHE_KEYS,
    CACHE_KEYS_TTL,
    EXPORT_TO_STREAM_KEYS,
    EVENTS,
} from '@libs/contracts/constants';
import { USER_USAGE_STREAM_MESSAGE_VERSION } from '@libs/contracts/models';

import { UsersQueuesService } from '@queue/_users/users-queues.service';

import { UsageEffects } from './durable-usage.service';

@Injectable()
export class UsageEffectsService {
    constructor(
        private readonly configService: TypedConfigService,
        private readonly usersQueuesService: UsersQueuesService,
        private readonly rawCacheService: RawCacheService,
    ) {}

    async apply(nodeUuid: string, nodeId: bigint, receipt: string, value: UsageEffects) {
        await this.rawCacheService.set(
            CACHE_KEYS.NODE_USERS_ONLINE(nodeUuid),
            value.owners.length,
            CACHE_KEYS_TTL.NODE_USERS_ONLINE,
        );
        if (value.firstConnected.length)
            await this.usersQueuesService.fireUserEventBulk(
                {
                    users: value.firstConnected.map((id) => ({ id: BigInt(id) })),
                    userEvent: EVENTS.USER.FIRST_CONNECTED,
                },
                receipt,
            );
        if (this.configService.getOrThrow('EXPORT_TO_STREAM_ENABLED')) {
            const separator = receipt.lastIndexOf('-');
            const stream = receipt.slice(0, separator),
                sequence = receipt.slice(separator + 1);
            for (let offset = 0; offset < value.owners.length; offset += 1500) {
                await this.rawCacheService.xaddUsageReceiptOnce(
                    EXPORT_TO_STREAM_KEYS.USER_USAGE,
                    this.configService.getOrThrow('EXPORT_TO_STREAM_MAXLEN'),
                    {
                        v: USER_USAGE_STREAM_MESSAGE_VERSION,
                        nodeId: nodeId.toString(),
                        ts: new Date(Number(value.capturedAt)).toISOString(),
                        receipt: `${receipt}-${offset / 1500}`,
                        records: value.owners
                            .slice(offset, offset + 1500)
                            .map((owner) => `${owner.id}:${owner.bytes}`)
                            .join(';'),
                    },
                    stream,
                    sequence,
                    offset / 1500,
                );
            }
        }
    }
}

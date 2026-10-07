import { GetBandwidthStatsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetBandwidthStatsQueryDto extends createZodDto(
    GetBandwidthStatsCommand.RequestQuerySchema,
) {}
export class GetBandwidthStatsResponseDto extends createZodDto(
    GetBandwidthStatsCommand.ResponseSchema,
) {}

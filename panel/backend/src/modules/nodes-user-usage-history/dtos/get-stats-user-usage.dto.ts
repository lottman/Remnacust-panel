import { GetStatsUserUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsUserUsageQueryDto extends createZodDto(
    GetStatsUserUsageCommand.RequestQuerySchema,
) {}

export class GetStatsUserUsageParamDto extends createZodDto(
    GetStatsUserUsageCommand.RequestParamSchema,
) {}

export class GetStatsUserUsageResponseDto extends createZodDto(
    GetStatsUserUsageCommand.ResponseSchema,
) {}

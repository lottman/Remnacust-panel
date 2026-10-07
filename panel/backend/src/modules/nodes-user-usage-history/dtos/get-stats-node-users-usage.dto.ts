import { GetStatsNodeUsersUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsNodeUsersUsageQueryDto extends createZodDto(
    GetStatsNodeUsersUsageCommand.RequestQuerySchema,
) {}

export class GetStatsNodeUsersUsageParamDto extends createZodDto(
    GetStatsNodeUsersUsageCommand.RequestParamSchema,
) {}

export class GetStatsNodeUsersUsageResponseDto extends createZodDto(
    GetStatsNodeUsersUsageCommand.ResponseSchema,
) {}

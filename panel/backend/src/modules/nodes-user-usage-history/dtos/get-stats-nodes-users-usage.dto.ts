import { GetStatsNodesUsersUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsNodesUsersUsageQueryDto extends createZodDto(
    GetStatsNodesUsersUsageCommand.RequestQuerySchema,
) {}

export class GetStatsNodesUsersUsageBodyDto extends createZodDto(
    GetStatsNodesUsersUsageCommand.RequestBodySchema,
) {}

export class GetStatsNodesUsersUsageResponseDto extends createZodDto(
    GetStatsNodesUsersUsageCommand.ResponseSchema,
) {}

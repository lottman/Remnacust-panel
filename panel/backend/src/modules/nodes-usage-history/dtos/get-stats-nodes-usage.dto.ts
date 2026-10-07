import { GetStatsNodesUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsNodesUsageQueryDto extends createZodDto(
    GetStatsNodesUsageCommand.RequestQuerySchema,
) {}
export class GetStatsNodesUsageResponseDto extends createZodDto(
    GetStatsNodesUsageCommand.ResponseSchema,
) {}

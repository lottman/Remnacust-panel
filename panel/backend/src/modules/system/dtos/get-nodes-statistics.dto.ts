import { GetNodesStatisticsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodesStatisticsQueryDto extends createZodDto(
    GetNodesStatisticsCommand.RequestQuerySchema,
) {}
export class GetNodesStatisticsResponseDto extends createZodDto(
    GetNodesStatisticsCommand.ResponseSchema,
) {}

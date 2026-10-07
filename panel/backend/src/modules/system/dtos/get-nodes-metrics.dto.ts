import { GetNodesMetricsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodesMetricsResponseDto extends createZodDto(
    GetNodesMetricsCommand.ResponseSchema,
) {}

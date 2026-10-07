import { GetStatsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsQueryDto extends createZodDto(GetStatsCommand.RequestQuerySchema) {}
export class GetStatsResponseDto extends createZodDto(GetStatsCommand.ResponseSchema) {}

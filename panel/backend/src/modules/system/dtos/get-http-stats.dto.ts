import { GetHttpStatsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetHttpStatsResponseDto extends createZodDto(GetHttpStatsCommand.ResponseSchema) {}

import { GetStatsDigestCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetStatsDigestQueryDto extends createZodDto(GetStatsDigestCommand.RequestQuerySchema) {}
export class GetStatsDigestResponseDto extends createZodDto(GetStatsDigestCommand.ResponseSchema) {}

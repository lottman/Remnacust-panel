import { GetNodeUsageCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetNodeUsageQueryDto extends createZodDto(GetNodeUsageCommand.RequestQuerySchema) {}

export class GetNodeUsageBodyDto extends createZodDto(GetNodeUsageCommand.RequestBodySchema) {}

export class GetNodeUsageResponseDto extends createZodDto(GetNodeUsageCommand.ResponseSchema) {}

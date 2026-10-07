import { createZodDto } from 'nestjs-zod';
import { GetNodeRuntimeCommand } from '@libs/contracts/commands';
export class GetNodeRuntimeResponseDto extends createZodDto(GetNodeRuntimeCommand.ResponseSchema) {}

import { GetRecapCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetRecapResponseDto extends createZodDto(GetRecapCommand.ResponseSchema) {}

import { GetRemnawaveHealthCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetRemnawaveHealthResponseDto extends createZodDto(
    GetRemnawaveHealthCommand.ResponseSchema,
) {}

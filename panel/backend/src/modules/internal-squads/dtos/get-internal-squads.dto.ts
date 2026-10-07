import { createZodDto } from 'nestjs-zod';

import { GetInternalSquadsCommand } from '@libs/contracts/commands';

export class GetInternalSquadsResponseDto extends createZodDto(
    GetInternalSquadsCommand.ResponseSchema,
) {}

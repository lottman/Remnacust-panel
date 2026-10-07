import { createZodDto } from 'nestjs-zod';

import { GetConnectionKeysByUserIdCommand } from '@libs/contracts/commands';

export class GetConnectionKeysByUserIdParamDto extends createZodDto(
    GetConnectionKeysByUserIdCommand.RequestParamSchema,
) {}

export class GetConnectionKeysByUserIdResponseDto extends createZodDto(
    GetConnectionKeysByUserIdCommand.ResponseSchema,
) {}

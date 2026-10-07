import { createZodDto } from 'nestjs-zod';

import { GetUsersStreamCommand } from '@libs/contracts/commands';

export class GetUsersStreamQueryDto extends createZodDto(
    GetUsersStreamCommand.RequestQuerySchema,
) {}
export class GetUsersStreamResponseDto extends createZodDto(GetUsersStreamCommand.ResponseSchema) {}

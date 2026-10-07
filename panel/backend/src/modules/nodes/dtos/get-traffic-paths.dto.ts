import { createZodDto } from 'nestjs-zod';

import { GetTrafficPathsCommand } from '@libs/contracts/commands';

export class GetTrafficPathsQueryDto extends createZodDto(
    GetTrafficPathsCommand.RequestQuerySchema,
) {}
export class GetTrafficPathsResponseDto extends createZodDto(
    GetTrafficPathsCommand.ResponseSchema,
) {}

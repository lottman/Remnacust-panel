import { createZodDto } from 'nestjs-zod';

import { GetUsersCommand } from '@libs/contracts/commands';

export class GetUsersQueryDto extends createZodDto(GetUsersCommand.RequestQuerySchema) {}
export class GetUsersResponseDto extends createZodDto(GetUsersCommand.ResponseSchema) {}

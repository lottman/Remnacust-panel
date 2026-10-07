import { createZodDto } from 'nestjs-zod';

import { GetUsersTagsCommand } from '@libs/contracts/commands';

export class GetUsersTagsResponseDto extends createZodDto(GetUsersTagsCommand.ResponseSchema) {}

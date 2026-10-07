import { createZodDto } from 'nestjs-zod';

import { GetHostsTagsCommand } from '@libs/contracts/commands';

export class GetHostsTagsResponseDto extends createZodDto(GetHostsTagsCommand.ResponseSchema) {}

import { createZodDto } from 'nestjs-zod';

import { GetUserByIdCommand } from '@libs/contracts/commands';

export class GetUserByIdParamDto extends createZodDto(GetUserByIdCommand.RequestParamSchema) {}

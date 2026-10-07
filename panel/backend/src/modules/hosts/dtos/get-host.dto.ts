import { createZodDto } from 'nestjs-zod';

import { GetHostCommand } from '@libs/contracts/commands';

export class GetHostParamDto extends createZodDto(GetHostCommand.RequestParamSchema) {}

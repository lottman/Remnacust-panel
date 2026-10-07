import { createZodDto } from 'nestjs-zod';

import { ExtendUserCommand } from '@libs/contracts/commands';

export class ExtendUserParamDto extends createZodDto(ExtendUserCommand.RequestParamSchema) {}

export class ExtendUserBodyDto extends createZodDto(ExtendUserCommand.RequestBodySchema) {}

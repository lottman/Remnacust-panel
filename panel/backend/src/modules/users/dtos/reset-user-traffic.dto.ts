import { createZodDto } from 'nestjs-zod';

import { ResetUserTrafficCommand } from '@libs/contracts/commands';

export class ResetUserTrafficParamDto extends createZodDto(
    ResetUserTrafficCommand.RequestParamSchema,
) {}

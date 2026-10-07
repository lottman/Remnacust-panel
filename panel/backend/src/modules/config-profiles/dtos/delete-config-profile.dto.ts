import { createZodDto } from 'nestjs-zod';

import { DeleteConfigProfileCommand } from '@libs/contracts/commands';

export class DeleteConfigProfileParamDto extends createZodDto(
    DeleteConfigProfileCommand.RequestParamSchema,
) {}

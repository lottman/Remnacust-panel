import { createZodDto } from 'nestjs-zod';

import { DeleteInternalSquadCommand } from '@libs/contracts/commands';

export class DeleteInternalSquadParamDto extends createZodDto(
    DeleteInternalSquadCommand.RequestParamSchema,
) {}

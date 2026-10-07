import { createZodDto } from 'nestjs-zod';

import { DeleteExternalSquadCommand } from '@libs/contracts/commands';

export class DeleteExternalSquadParamDto extends createZodDto(
    DeleteExternalSquadCommand.RequestParamSchema,
) {}

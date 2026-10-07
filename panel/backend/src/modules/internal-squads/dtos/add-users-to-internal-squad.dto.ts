import { createZodDto } from 'nestjs-zod';

import { AddUsersToInternalSquadCommand } from '@libs/contracts/commands';

export class AddUsersToInternalSquadParamDto extends createZodDto(
    AddUsersToInternalSquadCommand.RequestParamSchema,
) {}

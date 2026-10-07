import { createZodDto } from 'nestjs-zod';

import { AddManyUsersToInternalSquadCommand } from '@libs/contracts/commands';

export class AddManyUsersToInternalSquadParamDto extends createZodDto(
    AddManyUsersToInternalSquadCommand.RequestParamSchema,
) {}

export class AddManyUsersToInternalSquadBodyDto extends createZodDto(
    AddManyUsersToInternalSquadCommand.RequestBodySchema,
) {}

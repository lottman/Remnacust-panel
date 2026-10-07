import { createZodDto } from 'nestjs-zod';

import { DeleteManyUsersFromInternalSquadCommand } from '@libs/contracts/commands';

export class DeleteManyUsersFromInternalSquadParamDto extends createZodDto(
    DeleteManyUsersFromInternalSquadCommand.RequestParamSchema,
) {}

export class DeleteManyUsersFromInternalSquadBodyDto extends createZodDto(
    DeleteManyUsersFromInternalSquadCommand.RequestBodySchema,
) {}

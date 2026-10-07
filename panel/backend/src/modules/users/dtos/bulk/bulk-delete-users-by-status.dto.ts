import { createZodDto } from 'nestjs-zod';

import { BulkDeleteUsersByStatusCommand } from '@libs/contracts/commands';

export class BulkDeleteUsersByStatusBodyDto extends createZodDto(
    BulkDeleteUsersByStatusCommand.RequestBodySchema,
) {}

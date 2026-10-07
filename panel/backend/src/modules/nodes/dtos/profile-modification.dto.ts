import { BulkNodesProfileModificationCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class ProfileModificationBodyDto extends createZodDto(
    BulkNodesProfileModificationCommand.RequestBodySchema,
) {}

import { BulkNodesActionsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class BulkNodesActionsBodyDto extends createZodDto(
    BulkNodesActionsCommand.RequestBodySchema,
) {}

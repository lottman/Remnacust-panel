import { createZodDto } from 'nestjs-zod';

import {
    BulkDisableHostsCommand,
    BulkEnableHostsCommand,
    BulkDeleteHostsCommand,
    UpdateManyHostsCommand,
} from '@libs/contracts/commands';

export class BulkDeleteHostsBodyDto extends createZodDto(
    BulkDeleteHostsCommand.RequestBodySchema,
) {}

export class BulkDisableHostsBodyDto extends createZodDto(
    BulkDisableHostsCommand.RequestBodySchema,
) {}

export class BulkEnableHostsBodyDto extends createZodDto(
    BulkEnableHostsCommand.RequestBodySchema,
) {}

export class UpdateManyHostsBodyDto extends createZodDto(
    UpdateManyHostsCommand.RequestBodySchema,
) {}

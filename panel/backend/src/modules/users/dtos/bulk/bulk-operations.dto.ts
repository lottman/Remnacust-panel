import { createZodDto } from 'nestjs-zod';

import {
    BulkAllExtendExpirationDateCommand,
    BulkAllUpdateUsersCommand,
    BulkDeleteUsersCommand,
    BulkExtendExpirationDateCommand,
    BulkResetTrafficUsersCommand,
    BulkRevokeUsersSubscriptionCommand,
    BulkUpdateUsersCommand,
    BulkUpdateUsersSquadsCommand,
} from '@libs/contracts/commands';

export class BulkResetTrafficUsersBodyDto extends createZodDto(
    BulkResetTrafficUsersCommand.RequestBodySchema,
) {}

export class BulkRevokeUsersSubscriptionBodyDto extends createZodDto(
    BulkRevokeUsersSubscriptionCommand.RequestBodySchema,
) {}

export class BulkDeleteUsersBodyDto extends createZodDto(
    BulkDeleteUsersCommand.RequestBodySchema,
) {}

export class BulkUpdateUsersBodyDto extends createZodDto(
    BulkUpdateUsersCommand.RequestBodySchema,
) {}

export class BulkUpdateUsersSquadsBodyDto extends createZodDto(
    BulkUpdateUsersSquadsCommand.RequestBodySchema,
) {}

export class BulkAllUpdateUsersBodyDto extends createZodDto(
    BulkAllUpdateUsersCommand.RequestBodySchema,
) {}

export class BulkAllExtendExpirationDateBodyDto extends createZodDto(
    BulkAllExtendExpirationDateCommand.RequestBodySchema,
) {}

export class BulkExtendExpirationDateBodyDto extends createZodDto(
    BulkExtendExpirationDateCommand.RequestBodySchema,
) {}

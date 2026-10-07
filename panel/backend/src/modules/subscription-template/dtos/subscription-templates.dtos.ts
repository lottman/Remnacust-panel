import { createZodDto } from 'nestjs-zod';

import {
    UpdateSubscriptionTemplateCommand,
    GetSubscriptionTemplateCommand,
    GetSubscriptionTemplatesCommand,
    DeleteSubscriptionTemplateCommand,
    CreateSubscriptionTemplateCommand,
    ReorderSubscriptionTemplateCommand,
} from '@libs/contracts/commands';

export class GetTemplatesResponseDto extends createZodDto(
    GetSubscriptionTemplatesCommand.ResponseSchema,
) {} // GET_ALL

export class UpdateTemplateBodyDto extends createZodDto(
    UpdateSubscriptionTemplateCommand.RequestBodySchema,
) {} // UPDATE

export class UpdateTemplateResponseDto extends createZodDto(
    UpdateSubscriptionTemplateCommand.ResponseSchema,
) {} // UPDATE

export class GetTemplateResponseDto extends createZodDto(
    GetSubscriptionTemplateCommand.ResponseSchema,
) {} // GET BY UUID

export class GetTemplateParamDto extends createZodDto(
    GetSubscriptionTemplateCommand.RequestParamSchema,
) {} // GET BY UUID

export class DeleteSubscriptionTemplateParamDto extends createZodDto(
    DeleteSubscriptionTemplateCommand.RequestParamSchema,
) {} // DELETE

export class CreateSubscriptionTemplateBodyDto extends createZodDto(
    CreateSubscriptionTemplateCommand.RequestBodySchema,
) {} // CREATE

export class CreateSubscriptionTemplateResponseDto extends createZodDto(
    CreateSubscriptionTemplateCommand.ResponseSchema,
) {} // CREATE

export class ReorderSubscriptionTemplatesBodyDto extends createZodDto(
    ReorderSubscriptionTemplateCommand.RequestBodySchema,
) {} // REORDER
export class ReorderSubscriptionTemplatesResponseDto extends createZodDto(
    ReorderSubscriptionTemplateCommand.ResponseSchema,
) {} // REORDER

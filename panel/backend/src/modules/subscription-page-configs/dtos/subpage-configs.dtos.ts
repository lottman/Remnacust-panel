import { createZodDto } from 'nestjs-zod';

import {
    CloneSubpageConfigCommand,
    CreateSubpageConfigCommand,
    DeleteSubpageConfigCommand,
    GetSubpageConfigCommand,
    GetSubpageConfigsCommand,
    ReorderSubpageConfigsCommand,
    UpdateSubpageConfigCommand,
} from '@libs/contracts/commands';

export class GetSubpageConfigsResponseDto extends createZodDto(
    GetSubpageConfigsCommand.ResponseSchema,
) {} // GET_ALL

export class UpdateSubpageConfigBodyDto extends createZodDto(
    UpdateSubpageConfigCommand.RequestBodySchema,
) {} // UPDATE

export class UpdateSubpageConfigResponseDto extends createZodDto(
    UpdateSubpageConfigCommand.ResponseSchema,
) {} // UPDATE

export class GetSubpageConfigResponseDto extends createZodDto(
    GetSubpageConfigCommand.ResponseSchema,
) {} // GET BY UUID

export class GetSubpageConfigParamDto extends createZodDto(
    GetSubpageConfigCommand.RequestParamSchema,
) {} // GET BY UUID

export class DeleteSubpageConfigParamDto extends createZodDto(
    DeleteSubpageConfigCommand.RequestParamSchema,
) {} // DELETE

export class CreateSubpageConfigBodyDto extends createZodDto(
    CreateSubpageConfigCommand.RequestBodySchema,
) {} // CREATE

export class CreateSubpageConfigResponseDto extends createZodDto(
    CreateSubpageConfigCommand.ResponseSchema,
) {} // CREATE

export class ReorderSubpageConfigsBodyDto extends createZodDto(
    ReorderSubpageConfigsCommand.RequestBodySchema,
) {} // REORDER
export class ReorderSubpageConfigsResponseDto extends createZodDto(
    ReorderSubpageConfigsCommand.ResponseSchema,
) {} // REORDER

export class CloneSubpageConfigBodyDto extends createZodDto(
    CloneSubpageConfigCommand.RequestBodySchema,
) {} // CLONE
export class CloneSubpageConfigResponseDto extends createZodDto(
    CloneSubpageConfigCommand.ResponseSchema,
) {} // CLONE

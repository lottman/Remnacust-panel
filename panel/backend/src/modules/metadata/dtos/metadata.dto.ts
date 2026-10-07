import { createZodDto } from 'nestjs-zod';

import {
    UpsertNodeMetadataCommand,
    UpsertUserMetadataCommand,
    GetNodeMetadataCommand,
    GetUserMetadataCommand,
} from '@libs/contracts/commands';

export class GetNodeMetadataParamDto extends createZodDto(
    GetNodeMetadataCommand.RequestParamsSchema,
) {}
export class GetNodeMetadataResponseDto extends createZodDto(
    GetNodeMetadataCommand.ResponseSchema,
) {}

export class UpsertNodeMetadataParamDto extends createZodDto(
    UpsertNodeMetadataCommand.RequestParamsSchema,
) {}
export class UpsertNodeMetadataBodyDto extends createZodDto(
    UpsertNodeMetadataCommand.RequestBodySchema,
) {}
export class UpsertNodeMetadataResponseDto extends createZodDto(
    UpsertNodeMetadataCommand.ResponseSchema,
) {}

export class GetUserMetadataParamDto extends createZodDto(
    GetUserMetadataCommand.RequestParamsSchema,
) {}
export class GetUserMetadataResponseDto extends createZodDto(
    GetUserMetadataCommand.ResponseSchema,
) {}

export class UpsertUserMetadataParamDto extends createZodDto(
    UpsertUserMetadataCommand.RequestParamsSchema,
) {}
export class UpsertUserMetadataBodyDto extends createZodDto(
    UpsertUserMetadataCommand.RequestBodySchema,
) {}

export class UpsertUserMetadataResponseDto extends createZodDto(
    UpsertUserMetadataCommand.ResponseSchema,
) {}

import { createZodDto } from 'nestjs-zod';

import { GetInboundsByProfileUuidCommand } from '@libs/contracts/commands';

export class GetInboundsByProfileUuidParamDto extends createZodDto(
    GetInboundsByProfileUuidCommand.RequestParamSchema,
) {}
export class GetInboundsByProfileUuidResponseDto extends createZodDto(
    GetInboundsByProfileUuidCommand.ResponseSchema,
) {}

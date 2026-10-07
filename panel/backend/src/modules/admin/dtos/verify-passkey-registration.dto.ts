import { createZodDto } from 'nestjs-zod';

import { VerifyPasskeyRegistrationCommand } from '@libs/contracts/commands';

export class VerifyPasskeyRegistrationBodyDto extends createZodDto(
    VerifyPasskeyRegistrationCommand.RequestBodySchema,
) {}
export class VerifyPasskeyRegistrationResponseDto extends createZodDto(
    VerifyPasskeyRegistrationCommand.ResponseSchema,
) {}

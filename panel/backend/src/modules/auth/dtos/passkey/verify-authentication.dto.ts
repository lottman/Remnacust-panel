import { createZodDto } from 'nestjs-zod';

import { VerifyPasskeyAuthenticationCommand } from '@libs/contracts/commands';

export class VerifyPasskeyAuthenticationBodyDto extends createZodDto(
    VerifyPasskeyAuthenticationCommand.RequestBodySchema,
) {}
export class VerifyPasskeyAuthenticationResponseDto extends createZodDto(
    VerifyPasskeyAuthenticationCommand.ResponseSchema,
) {}

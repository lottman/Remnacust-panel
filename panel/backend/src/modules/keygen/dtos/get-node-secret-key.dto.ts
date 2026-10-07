import { createZodDto } from 'nestjs-zod';

import { GetNodeSecretKeyCommand } from '@libs/contracts/commands';

export class GetNodeSecretKeyResponseDto extends createZodDto(
    GetNodeSecretKeyCommand.ResponseSchema,
) {}

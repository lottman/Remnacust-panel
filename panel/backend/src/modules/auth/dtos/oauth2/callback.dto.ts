import { createZodDto } from 'nestjs-zod';

import { OAuth2CallbackCommand } from '@libs/contracts/commands';

export class OAuth2CallbackBodyDto extends createZodDto(OAuth2CallbackCommand.RequestBodySchema) {}
export class OAuth2CallbackResponseDto extends createZodDto(OAuth2CallbackCommand.ResponseSchema) {}

import { createZodDto } from 'nestjs-zod';

import { OAuth2AuthorizeCommand } from '@libs/contracts/commands';

export class OAuth2AuthorizeBodyDto extends createZodDto(
    OAuth2AuthorizeCommand.RequestBodySchema,
) {}

export class OAuth2AuthorizeResponseDto extends createZodDto(
    OAuth2AuthorizeCommand.ResponseSchema,
) {}

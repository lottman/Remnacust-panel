import { createZodDto } from 'nestjs-zod';
import { UpdateApiTokenCommand } from '@libs/contracts/commands';

export class UpdateApiTokenBodyDto extends createZodDto(UpdateApiTokenCommand.RequestBodySchema) {}
export class UpdateApiTokenParamDto extends createZodDto(UpdateApiTokenCommand.RequestParamSchema) {}
export class UpdateApiTokenResponseDto extends createZodDto(UpdateApiTokenCommand.ResponseSchema) {}

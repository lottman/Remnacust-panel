import {createZodDto} from 'nestjs-zod';
import {GetHwidRegistrationCommand,UpdateHwidRegistrationCommand} from '@contract/commands';
export class HwidRegistrationParamDto extends createZodDto(GetHwidRegistrationCommand.RequestParamSchema) {}
export class HwidRegistrationBodyDto extends createZodDto(UpdateHwidRegistrationCommand.RequestBodySchema) {}
export class HwidRegistrationResponseDto extends createZodDto(GetHwidRegistrationCommand.ResponseSchema) {}

import { CreateUserHwidDeviceCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class CreateUserHwidDeviceBodyDto extends createZodDto(
    CreateUserHwidDeviceCommand.RequestBodySchema,
) {}

export class CreateUserHwidDeviceResponseDto extends createZodDto(
    CreateUserHwidDeviceCommand.ResponseSchema,
) {}

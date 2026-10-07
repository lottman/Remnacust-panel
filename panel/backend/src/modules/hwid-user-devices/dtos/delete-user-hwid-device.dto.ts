import { DeleteUserHwidDeviceCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class DeleteUserHwidDeviceBodyDto extends createZodDto(
    DeleteUserHwidDeviceCommand.RequestBodySchema,
) {}

export class DeleteUserHwidDeviceResponseDto extends createZodDto(
    DeleteUserHwidDeviceCommand.ResponseSchema,
) {}

import { DeleteAllUserHwidDevicesCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class DeleteAllUserHwidDevicesBodyDto extends createZodDto(
    DeleteAllUserHwidDevicesCommand.RequestBodySchema,
) {}

export class DeleteAllUserHwidDevicesResponseDto extends createZodDto(
    DeleteAllUserHwidDevicesCommand.ResponseSchema,
) {}

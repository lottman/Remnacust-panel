import { GetUserHwidDevicesCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetUserHwidDevicesParamDto extends createZodDto(
    GetUserHwidDevicesCommand.RequestParamSchema,
) {}

export class GetUserHwidDevicesResponseDto extends createZodDto(
    GetUserHwidDevicesCommand.ResponseSchema,
) {}

import { GetTopUsersByHwidDevicesCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetTopUsersByHwidDevicesQueryDto extends createZodDto(
    GetTopUsersByHwidDevicesCommand.RequestQuerySchema,
) {}

export class GetTopUsersByHwidDevicesResponseDto extends createZodDto(
    GetTopUsersByHwidDevicesCommand.ResponseSchema,
) {}

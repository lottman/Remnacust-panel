import { GetHwidDevicesCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetHwidDevicesQueryDto extends createZodDto(
    GetHwidDevicesCommand.RequestQuerySchema,
) {}

export class GetHwidDevicesQueryResponseDto extends createZodDto(
    GetHwidDevicesCommand.ResponseSchema,
) {}

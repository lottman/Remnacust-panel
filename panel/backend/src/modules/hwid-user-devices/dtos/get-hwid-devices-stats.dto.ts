import { GetHwidDevicesStatsCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GetHwidDevicesStatsResponseDto extends createZodDto(
    GetHwidDevicesStatsCommand.ResponseSchema,
) {}

import { BlockUserHwidDeviceCommand, UnblockUserHwidDeviceCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class BlockUserHwidDeviceBodyDto extends createZodDto(
    BlockUserHwidDeviceCommand.RequestBodySchema,
) {}

export class BlockUserHwidDeviceResponseDto extends createZodDto(
    BlockUserHwidDeviceCommand.ResponseSchema,
) {}

export class UnblockUserHwidDeviceBodyDto extends createZodDto(
    UnblockUserHwidDeviceCommand.RequestBodySchema,
) {}

export class UnblockUserHwidDeviceResponseDto extends createZodDto(
    UnblockUserHwidDeviceCommand.ResponseSchema,
) {}

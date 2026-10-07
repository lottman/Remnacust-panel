import { createZodDto } from 'nestjs-zod';

import { HostResponseSchema } from '@libs/contracts/commands/hosts/host.response';

export class HostResponseDto extends createZodDto(HostResponseSchema) {}

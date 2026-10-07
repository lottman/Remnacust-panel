import { createZodDto } from 'nestjs-zod';

import { RegenerateHostSniCommand } from '@libs/contracts/commands';

export class RegenerateHostSniBodyDto extends createZodDto(
    RegenerateHostSniCommand.RequestBodySchema,
) {}

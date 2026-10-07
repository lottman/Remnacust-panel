import { createZodDto } from 'nestjs-zod';

import { GetPasskeysCommand } from '@libs/contracts/commands';

export class GetPasskeysResponseDto extends createZodDto(GetPasskeysCommand.ResponseSchema) {}

import { GenerateX25519Command } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class GenerateX25519ResponseDto extends createZodDto(GenerateX25519Command.ResponseSchema) {}

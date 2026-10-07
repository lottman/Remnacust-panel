import { TestSrrMatcherCommand } from '@contract/commands';
import { createZodDto } from 'nestjs-zod';

export class DebugSrrMatcherBodyDto extends createZodDto(TestSrrMatcherCommand.RequestBodySchema) {}

export class DebugSrrMatcherResponseDto extends createZodDto(
    TestSrrMatcherCommand.ResponseSchema,
) {}

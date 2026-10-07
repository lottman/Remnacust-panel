import { createZodDto } from 'nestjs-zod';

import { NodeResponseSchema } from '@libs/contracts/commands/nodes/node.response';

export class NodeResponseDto extends createZodDto(NodeResponseSchema) {}

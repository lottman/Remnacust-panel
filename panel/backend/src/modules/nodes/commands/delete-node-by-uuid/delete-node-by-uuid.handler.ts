import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { NodesRepository } from '../../repositories/nodes.repository';
import { DeleteNodeByUuidCommand } from './delete-node-by-uuid.command';

@CommandHandler(DeleteNodeByUuidCommand)
export class DeleteNodeByUuidHandler implements ICommandHandler<DeleteNodeByUuidCommand> {
    public readonly logger = new Logger(DeleteNodeByUuidHandler.name);

    constructor(private readonly nodesRepository: NodesRepository) {}

    async execute(command: DeleteNodeByUuidCommand) {
        try {
            await this.nodesRepository.deleteByUUID(command.uuid);
            return;
        } catch (error: unknown) {
            this.logger.error(`Error: ${error}`);
            return;
        }
    }
}

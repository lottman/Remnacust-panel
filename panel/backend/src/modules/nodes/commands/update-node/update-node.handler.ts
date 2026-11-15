import { ERRORS } from '@contract/constants';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';

import { NodesEntity } from '@modules/nodes/entities/nodes.entity';

import { NodeControlRevisionConflictError } from '../../node-control-addresses';
import { NodesRepository } from '../../repositories/nodes.repository';
import { UpdateNodeCommand } from './update-node.command';

@CommandHandler(UpdateNodeCommand)
export class UpdateNodeHandler implements ICommandHandler<UpdateNodeCommand, TResult<NodesEntity>> {
    public readonly logger = new Logger(UpdateNodeHandler.name);

    constructor(private readonly nodesRepository: NodesRepository) {}

    async execute(command: UpdateNodeCommand): Promise<TResult<NodesEntity>> {
        try {
            const node = command.healthObservation
                ? await this.nodesRepository.updateHealth(
                      command.node,
                      command.expectedControlRevision,
                      command.healthObservation,
                  )
                : await this.nodesRepository.update(command.node, command.expectedControlRevision);
            return ok(node);
        } catch (error: unknown) {
            if (error instanceof NodeControlRevisionConflictError)
                return fail(ERRORS.NODE_CONTROL_REVISION_CONFLICT);
            this.logger.error(`Error: ${error}`);
            return fail(ERRORS.UPDATE_NODE_ERROR);
        }
    }
}

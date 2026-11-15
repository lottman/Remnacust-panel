import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { NodeIpInventoryService } from '../../node-ip-inventory.service';
import { ObserveNodeIpInventoryCommand } from './observe-node-ip-inventory.command';

@CommandHandler(ObserveNodeIpInventoryCommand)
export class ObserveNodeIpInventoryHandler implements ICommandHandler<ObserveNodeIpInventoryCommand> {
    constructor(private readonly inventory: NodeIpInventoryService) {}

    execute(command: ObserveNodeIpInventoryCommand) {
        return this.inventory.observe(command.uuid, command.controlRevision, command.addresses);
    }
}

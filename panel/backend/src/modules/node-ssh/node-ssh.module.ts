import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { KeygenModule } from '@modules/keygen/keygen.module';
import { NodesModule } from '@modules/nodes/nodes.module';

import { NodeSshController } from './node-ssh.controller';
import { NodeSshService } from './node-ssh.service';
import { SshTerminalGateway } from './ssh/ssh-terminal.gateway';
import { StableEntryService } from './stable-entry.service';
import { VaultOprfService } from './vault-oprf.service';

@Module({
    imports: [CqrsModule, KeygenModule, NodesModule],
    controllers: [NodeSshController],
    providers: [NodeSshService, SshTerminalGateway, VaultOprfService, StableEntryService],
})
export class NodeSshModule {}

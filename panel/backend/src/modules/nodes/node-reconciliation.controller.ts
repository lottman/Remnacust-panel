import type { Request } from 'express';

import {
    CanActivate,
    Controller,
    ExecutionContext,
    Injectable,
    Param,
    ParseUUIDPipe,
    Post,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { TypedConfigService } from '@common/config/app-config';
import { RawCacheService } from '@common/raw-cache';
import { verifyNodeReconciliationToken } from '@common/utils/node-reconciliation';

import { NodesQueuesService } from '@queue/_nodes';

import { NodesRepository } from './repositories/nodes.repository';

@Injectable()
export class NodeReconciliationGuard implements CanActivate {
    constructor(
        private readonly config: TypedConfigService,
        private readonly nodes: NodesRepository,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const uuid = request.params.uuid;
        const header = request.headers.authorization;
        if (
            typeof uuid !== 'string' ||
            !/^[a-f0-9-]{36}$/.test(uuid) ||
            !header?.startsWith('Bearer ') ||
            !verifyNodeReconciliationToken(
                this.config.getOrThrow('APP_SECRET'),
                uuid,
                header.slice(7),
            )
        ) {
            throw new UnauthorizedException();
        }
        const node = await this.nodes.findByUUID(uuid);
        if (
            !node ||
            node.isDisabled ||
            !node.activeConfigProfileUuid ||
            !node.activeInbounds.length
        )
            throw new UnauthorizedException();
        return true;
    }
}

// This token can only ask for its own node's authoritative configuration to be
// delivered over the existing authenticated mTLS channel. It cannot read the API.
@ApiExcludeController()
@Controller('nodes')
@UseGuards(NodeReconciliationGuard)
export class NodeReconciliationController {
    constructor(
        private readonly queues: NodesQueuesService,
        private readonly cache: RawCacheService,
        private readonly nodes: NodesRepository,
    ) {}

    @Post(':uuid/reconcile')
    async reconcile(@Param('uuid', ParseUUIDPipe) uuid: string, @Req() request: Request) {
        const revision = await this.nodes.deviceStateRevision();
        const refresh = request.body?.refresh === true || request.body?.revision !== revision;
        const count = refresh
            ? await this.cache.incrementWithTtl(`node-reconciliation-rate:${uuid}`, 10)
            : 0;
        if (refresh && count === 1) await this.queues.startNode({ nodeUuid: uuid });
        return { accepted: true, refreshQueued: refresh && count === 1, revision };
    }
}

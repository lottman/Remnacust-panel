import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AxiosService } from '@common/axios';
import { errorHandler } from '@common/helpers/error-handler.helper';
import { GetNodeRuntimeCommand, NodeRuntimeSchema } from '@libs/contracts/commands';
import { GetNodeByUuidQuery } from './queries/get-node-by-uuid/get-node-by-uuid.query';
import { NodeHealthLogService } from './node-health-log.service';

@Injectable()
export class NodeRuntimeService {
    constructor(private readonly queryBus: QueryBus, private readonly axios: AxiosService,
        private readonly healthLog: NodeHealthLogService) {}

    async get(uuid: string): Promise<GetNodeRuntimeCommand.Response> {
        const node = errorHandler(await this.queryBus.execute(new GetNodeByUuidQuery(uuid)));
        if (!node) throw new ServiceUnavailableException('Could not read node');
        const [result, checks] = await Promise.all([
            node.isDisabled ? Promise.resolve(null) : this.axios.nodeRuntime(node),
            this.healthLog.list(uuid, 'all', 1, null).catch(() => []),
        ]);
        const parsed = result?.isOk ? NodeRuntimeSchema.safeParse(result.response) : null;
        return { response: {
            uuid, checkedAt: new Date().toISOString(), available: !!parsed?.success,
            reason: node.isDisabled ? 'disabled' : !result?.isOk ? 'unavailable_or_unsupported'
                : !parsed?.success ? 'invalid_node_response' : null,
            health: {
                connection: node.isDisabled ? 'disabled' : node.isConnecting ? 'connecting'
                    : node.isConnected ? 'connected' : 'disconnected',
                lastCheck: checks[0] ? { checkedAt: new Date(checks[0].checkedAt).toISOString(),
                    status: checks[0].status } : null,
            },
            runtime: parsed?.success ? parsed.data : null,
        } };
    }
}

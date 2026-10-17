import { sql } from 'kysely';

import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { TxKyselyService } from '@common/database';

export class GetPortPlanNodeUuidsQuery extends Query<string[]> {
    constructor(public readonly nodeUuids: string[]) {
        super();
    }
}

@QueryHandler(GetPortPlanNodeUuidsQuery)
export class GetPortPlanNodeUuidsHandler implements IQueryHandler<GetPortPlanNodeUuidsQuery> {
    constructor(private readonly db: TxKyselyService) {}

    async execute(query: GetPortPlanNodeUuidsQuery): Promise<string[]> {
        if (!query.nodeUuids.length) return [];
        const result = await sql<{ nodeUuid: string }>`SELECT node_uuid FROM xera_node_port_plans
            WHERE node_uuid=ANY(${query.nodeUuids}::uuid[]) ORDER BY node_uuid`.execute(
            this.db.kysely,
        );
        return result.rows.map((row) => row.nodeUuid);
    }
}

import { sql } from 'kysely';

import { Injectable, Logger } from '@nestjs/common';

import { TxKyselyService } from '@common/database';

import { NodesQueuesService } from '@queue/_nodes';

@Injectable()
export class PortPlanDispatchService {
    private readonly logger = new Logger(PortPlanDispatchService.name);
    constructor(
        private readonly db: TxKyselyService,
        private readonly queues: NodesQueuesService,
    ) {}

    async dispatch(nodeUuid: string | null = null): Promise<number> {
        // The statement commits a short delivery lease before Redis I/O. The
        // row remains due after the lease if Redis or the worker disappears.
        const claimed = await sql<{ nodeUuid: string; revision: string }>`
          WITH due AS (
            SELECT p.node_uuid FROM xera_node_port_plans p JOIN nodes n ON n.uuid=p.node_uuid
            WHERE (p.status<>'APPLIED' OR n.is_connecting) AND p.apply_after<=clock_timestamp() AND NOT n.is_disabled
              AND (p.delivery_until IS NULL OR p.delivery_until<=clock_timestamp())
              AND (${nodeUuid}::uuid IS NULL OR p.node_uuid=${nodeUuid}::uuid)
            ORDER BY p.apply_after,p.node_uuid LIMIT 20 FOR UPDATE OF p SKIP LOCKED
          ) UPDATE xera_node_port_plans p SET apply_after=clock_timestamp()+interval '30 seconds',
            apply_attempts=LEAST(p.apply_attempts+1,1000000)
          FROM due WHERE p.node_uuid=due.node_uuid RETURNING p.node_uuid,p.revision::text`.execute(
            this.db.kysely,
        );
        let queued = 0;
        for (const row of claimed.rows) {
            try {
                await this.queues.startNode({ nodeUuid: row.nodeUuid });
                queued++;
            } catch {
                this.logger.warn(`Port-plan delivery is pending for node ${row.nodeUuid}`);
                await sql`UPDATE xera_node_port_plans SET apply_after=clock_timestamp()+make_interval(secs=>LEAST(300,5*power(2,LEAST(apply_attempts,6)))::int),
                    error_code='QUEUE_UNAVAILABLE' WHERE node_uuid=${row.nodeUuid}::uuid AND revision=${row.revision}::bigint AND status<>'APPLIED'
                      AND (delivery_until IS NULL OR delivery_until<=clock_timestamp())`.execute(
                    this.db.kysely,
                );
            }
        }
        return queued;
    }
}

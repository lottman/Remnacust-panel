import { sql } from 'kysely';

import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { TxKyselyService } from '@common/database';

export class RecordPortPlanResultCommand extends Command<boolean> {
    constructor(
        public readonly nodeUuid: string,
        public readonly revision: string,
        public readonly applied: boolean,
    ) {
        super();
    }
}

@CommandHandler(RecordPortPlanResultCommand)
export class RecordPortPlanResultHandler implements ICommandHandler<RecordPortPlanResultCommand> {
    constructor(private readonly db: TxKyselyService) {}
    async execute(command: RecordPortPlanResultCommand): Promise<boolean> {
        // APPLIED absorbs delayed failures. An explicit retry sets PENDING even
        // for a previously acknowledged revision and must record its own error.
        const result =
            await sql`UPDATE xera_node_port_plans SET status=${command.applied ? 'APPLIED' : 'ERROR'},
            applied_revision=CASE WHEN ${command.applied} THEN revision ELSE applied_revision END,
            error_code=${command.applied ? null : 'NODE_APPLY_FAILED'},
            apply_after=CASE WHEN ${command.applied} THEN apply_after ELSE clock_timestamp()+make_interval(secs=>LEAST(300,5*power(2,LEAST(apply_attempts,6)))::int) END,
            apply_attempts=CASE WHEN ${command.applied} THEN 0 ELSE apply_attempts END,
            updated_at=clock_timestamp()
            WHERE node_uuid=${command.nodeUuid}::uuid AND revision=${command.revision}::bigint
              AND (${command.applied} OR status<>'APPLIED')
            RETURNING node_uuid`.execute(this.db.kysely);
        return result.rows.length === 1;
    }
}

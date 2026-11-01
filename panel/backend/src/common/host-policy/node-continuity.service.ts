import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { AxiosService } from '@common/axios';
import { TxKyselyService } from '@common/database';

import {
    checkNodeContinuity,
    NODE_CONTINUITY_SQL,
    ContinuityNode,
    ContinuityStatus,
} from './node-continuity';

@Injectable()
export class NodeContinuityService {
    constructor(
        private readonly db: TxKyselyService,
        private readonly axios: AxiosService,
        private readonly transactions: TransactionHost<TransactionalAdapterPrisma>,
    ) {}
    async check() {
        return checkNodeContinuity(
            async () =>
                this.transactions.withTransaction({ maxWait: 2000, timeout: 10000 }, async () => {
                    await this.transactions.tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
                    await this.transactions.tx.$executeRaw`SET LOCAL lock_timeout = '2000ms'`;
                    return (
                        await sql.raw<ContinuityNode>(NODE_CONTINUITY_SQL).execute(this.db.kysely)
                    ).rows;
                }),
            async (node) => {
                const result = await this.axios.hostPolicy<ContinuityStatus>(
                    node,
                    undefined,
                    undefined,
                    4 * 1024 * 1024,
                );
                if (!result.isOk) throw new Error('NODE_UNREACHABLE');
                return result.response;
            },
        );
    }
}

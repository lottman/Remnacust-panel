import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { sql } from 'kysely';

import { TxKyselyService } from '@common/database';
import { RawCacheService } from '@common/raw-cache';
import { fail, ok, TResult } from '@common/types';
import { ERRORS } from '@libs/contracts/constants';
import { SSH_TERMINAL_WS_PATH } from '@libs/contracts/models';

import type { IJWTAuthPayload } from '@modules/auth/interfaces';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';

import { ISshTicketPayload } from './interfaces';
import { CreateSshTicketResponseModel } from './models';

export const SSH_TICKET_TTL_SECONDS = 45;

const ticketKey = (ticket: string) => `ssh_ticket:${ticket}`;

@Injectable()
export class NodeSshService {
    private readonly logger = new Logger(NodeSshService.name);

    constructor(
        private readonly rawCacheService: RawCacheService,
        private readonly queryBus: QueryBus,
        private readonly db: TxKyselyService,
    ) {}

    public async recordOptimization(
        uuid: string,
        level: import('./ssh/optimization-status').OptimizationLevel | null,
    ): Promise<void> {
        // A failed read must not erase the last verified profile. Keep its age
        // and the result of the most recent verification separately.
        await sql`INSERT INTO xera_node_optimization(node_uuid,level,verified_at,checked_at,verified)
            SELECT uuid,${level},CASE WHEN ${level}::text IS NOT NULL THEN now() END,now(),${level !== null}
            FROM nodes WHERE uuid=${uuid}::uuid
            ON CONFLICT(node_uuid) DO UPDATE SET
              level=COALESCE(excluded.level,xera_node_optimization.level),
              verified_at=COALESCE(excluded.verified_at,xera_node_optimization.verified_at),
              checked_at=excluded.checked_at,verified=excluded.verified`.execute(this.db.kysely);
    }

    public async getOptimization(uuid: string) {
        const node = await this.queryBus.execute(new GetNodeByUuidQuery(uuid));
        if (!node.isOk) return fail(ERRORS.NODE_NOT_FOUND);
        const state = await sql<{
            level: import('./ssh/optimization-status').OptimizationLevel | null;
            checkedAt: Date | null;
            verifiedAt: Date | null;
            verified: boolean;
        }>`SELECT level,checked_at AS "checkedAt",verified_at AS "verifiedAt",verified
           FROM xera_node_optimization WHERE node_uuid=${uuid}::uuid`.execute(this.db.kysely);
        return ok(
            { nodeUuid: uuid, ...(state.rows[0] ?? { level: null, checkedAt: null, verifiedAt: null, verified: false }) },
        );
    }

    public async createTicket(
        nodeUuid: string,
        payload: IJWTAuthPayload,
        clientIp: string,
    ): Promise<TResult<CreateSshTicketResponseModel>> {
        try {
            if (!payload.uuid) {
                return fail(ERRORS.UNAUTHORIZED);
            }

            const node = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));
            if (!node.isOk) {
                return fail(ERRORS.NODE_NOT_FOUND);
            }

            const ticket = randomBytes(32).toString('base64url');

            const ticketPayload: ISshTicketPayload = {
                adminUuid: payload.uuid,
                nodeUuid: node.response.uuid,
                clientIp,
            };

            await this.rawCacheService.set(
                ticketKey(ticket),
                ticketPayload,
                SSH_TICKET_TTL_SECONDS,
            );

            return ok(
                new CreateSshTicketResponseModel({
                    ticket,
                    path: SSH_TERMINAL_WS_PATH,
                    expiresInSeconds: SSH_TICKET_TTL_SECONDS,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.CREATE_SSH_TICKET_ERROR);
        }
    }

    public async consumeTicket(
        ticket: string,
        clientIp: string,
    ): Promise<ISshTicketPayload | null> {
        let raw: null | string;
        try {
            raw = await this.rawCacheService.getDelString(ticketKey(ticket));
        } catch (error) {
            this.logger.error(`Failed to consume SSH ticket: ${String(error)}`);
            return null;
        }

        if (!raw) {
            return null;
        }

        let payload: ISshTicketPayload;
        try {
            payload = JSON.parse(raw) as ISshTicketPayload;
        } catch {
            return null;
        }

        // HTTPS and WebSocket may pass through different proxy paths or address
        // families. The ticket is single-use and is also bound to the admin JWT
        // by the gateway; an IP mismatch must not make a valid login unusable.
        if (payload.clientIp !== clientIp)
            this.logger.debug('SSH ticket was redeemed through a different proxy address.');

        return payload;
    }
}

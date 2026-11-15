import type { TNodeControlAddresses, TNodeIps } from '../../../../libs/contract/models';

import { TransactionHost } from '@nestjs-cls/transactional';
import { Transactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Prisma } from '@prisma/client';
import { sql } from 'kysely';

import { Injectable } from '@nestjs/common';

import { INodeConnectionOpts } from '@common/axios';
import { TxKyselyService } from '@common/database';
import { getKyselyUuid } from '@common/helpers/kysely/get-kysely-uuid';
import { values } from '@common/helpers/kysely/values';
import { ICrud } from '@common/types/crud-port';

import { NodesEntity } from '../entities/nodes.entity';
import { IReorderNode } from '../interfaces';
import {
    reconcileNodeControlAddresses,
    NodeControlRevisionConflictError,
} from '../node-control-addresses';
import { NodesConverter } from '../nodes.converter';
import { IGetEnabledNodesPartialResponse } from '../queries/get-enabled-nodes-partial/get-enabled-nodes-partial.query';
import { IGetOnlineNodesPartialResponse } from '../queries/get-online-nodes';

export type INodesWithResolvedInbounds = Prisma.NodesGetPayload<{
    include: {
        configProfileInboundsToNodes: {
            select: {
                configProfileInbounds: true;
            };
        };
        provider: true;
    };
}>;

const INCLUDE_RESOLVED_INBOUNDS = {
    configProfileInboundsToNodes: {
        select: {
            configProfileInbounds: true,
        },
    },
    provider: true,
} as const;

@Injectable()
export class NodesRepository implements ICrud<NodesEntity> {
    constructor(
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
        private readonly qb: TxKyselyService,
        private readonly nodesConverter: NodesConverter,
    ) {}

    @Transactional()
    public async create(entity: NodesEntity, inboundUuids?: string[]): Promise<NodesEntity> {
        const model = this.nodesConverter.fromEntityToPrismaModel(entity);
        const result = await this.prisma.tx.nodes.create({
            data: {
                ...model,
                ...(inboundUuids?.length
                    ? {
                          configProfileInboundsToNodes: {
                              createMany: {
                                  data: inboundUuids.map((configProfileInboundUuid) => ({
                                      configProfileInboundUuid,
                                  })),
                              },
                          },
                      }
                    : {}),
            },
            include: INCLUDE_RESOLVED_INBOUNDS,
        });

        return new NodesEntity(
            inboundUuids?.length
                ? await this.prisma.tx.nodes.findUniqueOrThrow({
                      where: { uuid: result.uuid },
                      include: INCLUDE_RESOLVED_INBOUNDS,
                  })
                : result,
        );
    }

    public async findConnectedNodes(): Promise<NodesEntity[]> {
        const nodesList = await this.prisma.tx.nodes.findMany({
            where: {
                isConnected: true,
                isDisabled: false,
                isConnecting: false,
                activeConfigProfileUuid: {
                    not: null,
                },
            },
            include: INCLUDE_RESOLVED_INBOUNDS,
        });

        return nodesList.map((value) => new NodesEntity(value));
    }

    public async deviceStateRevision(): Promise<string> {
        const result = await sql<{
            revision: string;
        }>`SELECT revision::text FROM xera_device_state WHERE id=1`.execute(this.qb.kysely);
        if (!result.rows[0]) throw new Error('Device state migration is missing');
        return result.rows[0].revision;
    }

    public async findConnectedNodesPartial(): Promise<IGetOnlineNodesPartialResponse[]> {
        const nodesList = await this.qb.kysely
            .selectFrom('nodes')
            .select([
                'uuid',
                'consumptionMultiplier',
                'nodeConsumptionMultiplier',
                'id',
                'address',
                'port',
                'proxyUrl',
            ])
            .where('isConnected', '=', true)
            .where('isDisabled', '=', false)
            .where('isConnecting', '=', false)
            .where('activeConfigProfileUuid', 'is not', null)
            .execute();

        return nodesList.map((value) => ({
            uuid: value.uuid,
            consumptionMultiplier: value.consumptionMultiplier,
            nodeConsumptionMultiplier: value.nodeConsumptionMultiplier,
            id: value.id,
            connectionOpts: {
                uuid: value.uuid,
                address: value.address,
                port: value.port,
                proxyUrl: value.proxyUrl,
            },
        }));
    }

    public async findEnabledNodesPartial(): Promise<IGetEnabledNodesPartialResponse[]> {
        const nodesList = await this.qb.kysely
            .selectFrom('nodes')
            .select([
                'uuid',
                'isConnected',
                'lastStatusMessage',
                'controlRevision',
                'address',
                'port',
                'proxyUrl',
            ])
            .where('isDisabled', '=', false)
            .where('isConnecting', '=', false)
            .execute();

        return nodesList.map((value) => ({
            uuid: value.uuid,
            isConnected: value.isConnected,
            lastStatusMessage: value.lastStatusMessage,
            controlRevision: value.controlRevision,
            connectionOpts: {
                uuid: value.uuid,
                address: value.address,
                port: value.port,
                proxyUrl: value.proxyUrl,
            },
        }));
    }

    public async findConnectedNodesWithoutInbounds(): Promise<
        {
            uuid: string;
            connectionOpts: INodeConnectionOpts;
        }[]
    > {
        const result = await this.prisma.tx.nodes.findMany({
            select: {
                uuid: true,
                address: true,
                port: true,
                proxyUrl: true,
            },
            where: {
                isConnected: true,
                isDisabled: false,
                activeConfigProfileUuid: {
                    not: null,
                },
            },
        });

        return result.map((value) => ({
            uuid: value.uuid,
            connectionOpts: {
                uuid: value.uuid,
                address: value.address,
                port: value.port,
                proxyUrl: value.proxyUrl,
            },
        }));
    }

    public async findAllNodes(): Promise<NodesEntity[]> {
        const nodesList = await this.prisma.tx.nodes.findMany({
            include: INCLUDE_RESOLVED_INBOUNDS,
        });

        return nodesList.map((value) => new NodesEntity(value));
    }

    public async incrementUsedTraffic(nodeUuid: string, bytes: bigint): Promise<void> {
        await this.prisma.tx.nodes.update({
            where: { uuid: nodeUuid },
            data: { trafficUsedBytes: { increment: bytes } },
        });
    }

    public async findByUUID(uuid: string): Promise<NodesEntity | null> {
        const result = await this.prisma.tx.nodes.findUnique({
            where: { uuid },
            include: INCLUDE_RESOLVED_INBOUNDS,
        });
        if (!result) {
            return null;
        }
        return new NodesEntity(result);
    }

    public async update(
        { uuid, ...data }: Partial<NodesEntity>,
        expectedRevision?: string,
        inboundUuids?: string[],
    ): Promise<NodesEntity> {
        if (
            inboundUuids !== undefined ||
            expectedRevision !== undefined ||
            data.controlAddresses !== undefined ||
            data.address !== undefined ||
            data.ips !== undefined
        ) {
            return this.updateControlAddresses({ uuid, ...data }, expectedRevision, inboundUuids);
        }
        return this.persistUpdate({ uuid, ...data }, inboundUuids);
    }

    @Transactional()
    private async updateControlAddresses(
        { uuid, ...data }: Partial<NodesEntity>,
        expectedRevision?: string,
        inboundUuids?: string[],
    ): Promise<NodesEntity> {
        const [before] = await this.prisma.tx.$queryRaw<
            {
                address: string;
                ips: TNodeIps;
                controlAddresses: TNodeControlAddresses;
                controlRevision: string;
            }[]
        >`SELECT address, ips, control_addresses AS "controlAddresses", control_revision::text AS "controlRevision" FROM nodes
            WHERE uuid = ${uuid}::uuid FOR UPDATE`;
        if (before && expectedRevision !== undefined && before.controlRevision !== expectedRevision)
            throw new NodeControlRevisionConflictError();
        if (before) data.controlAddresses = reconcileNodeControlAddresses(before, data);
        if (
            data.controlAddresses !== undefined &&
            !data.controlAddresses.some((row) => row.enabled)
        ) {
            data.isConnected = false;
            data.isConnecting = false;
            data.lastStatusMessage = '[NODE_CONTROL_DISABLED]';
            data.lastStatusChange = new Date();
        }
        return this.persistUpdate({ uuid, ...data }, inboundUuids);
    }

    private async persistUpdate(
        { uuid, ...data }: Partial<NodesEntity>,
        inboundUuids?: string[],
    ): Promise<NodesEntity> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { provider, activeInbounds, ...prismaData } = data;

        const result = await this.prisma.tx.nodes.update({
            where: { uuid },
            data: {
                ...prismaData,
                ...(inboundUuids === undefined
                    ? {}
                    : {
                          configProfileInboundsToNodes: {
                              deleteMany: {},
                              ...(inboundUuids.length
                                  ? {
                                        createMany: {
                                            data: [...new Set(inboundUuids)].map(
                                                (configProfileInboundUuid) => ({
                                                    configProfileInboundUuid,
                                                }),
                                            ),
                                        },
                                    }
                                  : {}),
                          },
                      }),
            },
            include: INCLUDE_RESOLVED_INBOUNDS,
        });

        return new NodesEntity(
            inboundUuids === undefined
                ? result
                : await this.prisma.tx.nodes.findUniqueOrThrow({
                      where: { uuid },
                      include: INCLUDE_RESOLVED_INBOUNDS,
                  }),
        );
    }

    public async findByCriteria(dto: Partial<NodesEntity>): Promise<NodesEntity[]> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tags, ips, controlAddresses, integrationUuids, ...rest } = dto;
        const nodesList = await this.prisma.tx.nodes.findMany({
            where: rest,
            orderBy: {
                viewPosition: 'asc',
            },
            include: INCLUDE_RESOLVED_INBOUNDS,
        });
        return nodesList.map((value) => new NodesEntity(value));
    }

    public async findByCriteriaPrisma(where: Prisma.NodesWhereInput): Promise<NodesEntity[]> {
        const nodesList = await this.prisma.tx.nodes.findMany({
            where,
            orderBy: {
                viewPosition: 'asc',
            },
            include: INCLUDE_RESOLVED_INBOUNDS,
        });
        return nodesList.map((value) => new NodesEntity(value));
    }

    public async findFirstByCriteria(dto: Partial<NodesEntity>): Promise<NodesEntity | null> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tags, ips, controlAddresses, integrationUuids, ...rest } = dto;
        const result = await this.prisma.tx.nodes.findFirst({
            where: rest,
            include: INCLUDE_RESOLVED_INBOUNDS,
        });

        if (!result) {
            return null;
        }

        return new NodesEntity(result);
    }

    public async deleteByUUID(uuid: string): Promise<boolean> {
        const result = await this.prisma.tx.nodes.delete({ where: { uuid } });
        return !!result;
    }

    public async reorderMany(dto: IReorderNode[]): Promise<boolean> {
        if (dto.length === 0) return true;

        const v = values(
            dto.map(({ uuid, viewPosition }) => ({
                uuid: sql<string>`${uuid}::uuid`,
                viewPosition: sql<number>`${viewPosition}::int`,
            })),
            'v',
        );

        await this.qb.kysely
            .updateTable('nodes as n')
            .from(v)
            .set((eb) => ({ viewPosition: eb.ref('v.viewPosition') }))
            .whereRef('n.uuid', '=', 'v.uuid')
            .execute();

        await this.prisma.tx
            .$executeRaw`SELECT setval('nodes_view_position_seq', (SELECT MAX(view_position) FROM nodes) + 1)`;

        return true;
    }

    public async removeInboundsFromNode(nodeUuid: string): Promise<boolean> {
        const result = await this.qb.kysely
            .deleteFrom('configProfileInboundsToNodes')
            .where('nodeUuid', '=', getKyselyUuid(nodeUuid))
            .executeTakeFirst();

        return !!result;
    }

    public async addInboundsToNode(nodeUuid: string, inboundsUuids: string[]): Promise<boolean> {
        const result = await this.qb.kysely
            .insertInto('configProfileInboundsToNodes')
            .values(
                inboundsUuids.map((uuid) => ({
                    nodeUuid: getKyselyUuid(nodeUuid),
                    configProfileInboundUuid: getKyselyUuid(uuid),
                })),
            )
            .executeTakeFirst();

        return !!result;
    }

    public async removeInboundsFromNodes(nodeUuids: string[]): Promise<boolean> {
        const result = await this.qb.kysely
            .deleteFrom('configProfileInboundsToNodes')
            .where(
                'nodeUuid',
                'in',
                nodeUuids.map((uuid) => getKyselyUuid(uuid)),
            )
            .executeTakeFirst();

        return !!result;
    }

    public async addInboundsToNodes(
        nodeUuids: string[],
        inboundsUuids: string[],
    ): Promise<boolean> {
        const values = nodeUuids.flatMap((nodeUuid) =>
            inboundsUuids.map((uuid) => ({
                nodeUuid: getKyselyUuid(nodeUuid),
                configProfileInboundUuid: getKyselyUuid(uuid),
            })),
        );

        const result = await this.qb.kysely
            .insertInto('configProfileInboundsToNodes')
            .values(values)
            .executeTakeFirst();

        return !!result;
    }

    public async clearActiveConfigProfileForNodesWithoutInbounds(): Promise<number> {
        const result = await this.qb.kysely
            .updateTable('nodes')
            .set({
                activeConfigProfileUuid: null,
            })
            .where('activeConfigProfileUuid', 'is not', null)
            .where((eb) =>
                eb.not(
                    eb.exists(
                        eb
                            .selectFrom('configProfileInboundsToNodes')
                            .select('nodeUuid')
                            .whereRef('nodeUuid', '=', 'nodes.uuid'),
                    ),
                ),
            )
            .executeTakeFirst();

        return Number(result.numUpdatedRows || 0);
    }

    public async findAllTags(): Promise<string[]> {
        const result = await this.qb.kysely
            .selectFrom('nodes')
            .select(sql<string>`unnest(tags)`.as('tag'))
            .distinct()
            .where('tags', 'is not', null)
            .orderBy('tag')
            .execute();

        return result.map((value) => value.tag);
    }

    public async getEnabledNodesByPluginUuid(pluginUuid: string): Promise<string[]> {
        const result = await this.qb.kysely
            .selectFrom('nodes')
            .select('uuid')
            .where('activePluginUuid', '=', getKyselyUuid(pluginUuid))
            .where('isDisabled', '=', false)
            .where('isConnected', '=', true)
            .where('isConnecting', '=', false)
            .execute();

        return result.map((value) => value.uuid);
    }

    public async getProfileUuidsByIntegrationUuid(integrationUuid: string): Promise<string[]> {
        const result = await this.qb.kysely
            .selectFrom('nodes')
            .select('activeConfigProfileUuid')
            .distinct()
            .where(
                sql<boolean>`${sql.ref('nodes.integration_uuids')} @> ARRAY[${getKyselyUuid(integrationUuid)}]`,
            )
            .where('isDisabled', '=', false)
            .where('activeConfigProfileUuid', 'is not', null)
            .execute();

        return result
            .map((value) => value.activeConfigProfileUuid)
            .filter((uuid): uuid is string => uuid !== null);
    }

    public async getProfileUuidsByNodeUuids(nodeUuids: string[]): Promise<string[]> {
        if (nodeUuids.length === 0) {
            return [];
        }

        const result = await this.qb.kysely
            .selectFrom('nodes')
            .select('activeConfigProfileUuid')
            .distinct()
            .where(
                'uuid',
                'in',
                nodeUuids.map((uuid) => getKyselyUuid(uuid)),
            )
            .where('isDisabled', '=', false)
            .where('activeConfigProfileUuid', 'is not', null)
            .execute();

        return result
            .map((value) => value.activeConfigProfileUuid)
            .filter((uuid): uuid is string => uuid !== null);
    }

    public async removeIntegrationFromNodes(integrationUuid: string): Promise<boolean> {
        const result = await this.qb.kysely
            .updateTable('nodes')
            .set({
                integrationUuids: sql<
                    string[]
                >`array_remove(${sql.ref('nodes.integration_uuids')}, ${getKyselyUuid(integrationUuid)})`,
            })
            .where(
                sql<boolean>`${sql.ref('nodes.integration_uuids')} @> ARRAY[${getKyselyUuid(integrationUuid)}]`,
            )
            .execute();

        return !!result;
    }

    public async updateMany(uuids: string[], fields: Partial<NodesEntity>): Promise<boolean> {
        const result = await this.prisma.tx.nodes.updateMany({
            where: {
                uuid: {
                    in: uuids,
                },
            },
            data: fields,
        });

        return !!result;
    }

    @Transactional()
    public async assignProfile(
        uuids: string[],
        profileUuid: string,
        inboundUuids: string[],
    ): Promise<void> {
        const nodeUuids = [...new Set(uuids.map((uuid) => uuid.toLowerCase()))].sort();
        const ids = nodeUuids.map((uuid) => Prisma.sql`${uuid}::uuid`);
        if (!ids.length) return;
        await this.prisma.tx
            .$queryRaw`SELECT uuid FROM public.nodes WHERE uuid IN (${Prisma.join(ids)}) ORDER BY uuid FOR UPDATE`;
        await this.updateMany(nodeUuids, { activeConfigProfileUuid: profileUuid });
        await this.removeInboundsFromNodes(nodeUuids);
        if (inboundUuids.length)
            await this.addInboundsToNodes(nodeUuids, [
                ...new Set(inboundUuids.map((uuid) => uuid.toLowerCase())),
            ]);
        await this.prisma.tx
            .$executeRaw`UPDATE public.nodes SET is_connected = false, is_connecting = false,
            last_status_change = clock_timestamp(), last_status_message = CASE WHEN EXISTS (
                SELECT 1 FROM jsonb_array_elements(control_addresses) AS route WHERE route->'enabled' = 'true'::jsonb
            ) THEN '[NODE_UPDATE_PENDING]' ELSE '[NODE_CONTROL_DISABLED]' END
            WHERE uuid IN (${Prisma.join(ids)}) AND NOT is_disabled`;
    }

    public async getNodeIdByUuid(uuid: string): Promise<bigint | null> {
        const result = await this.qb.kysely
            .selectFrom('nodes')
            .select('id')
            .where('uuid', '=', getKyselyUuid(uuid))
            .executeTakeFirst();

        if (!result) {
            return null;
        }

        return result.id;
    }
}

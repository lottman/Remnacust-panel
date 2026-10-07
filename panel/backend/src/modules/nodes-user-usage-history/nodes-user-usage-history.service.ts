import dayjs from 'dayjs';

import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { fail, ok, TResult } from '@common/types';
import { getDateRangeArrayUtil } from '@common/utils/get-date-range-array.util';
import { ERRORS } from '@libs/contracts/constants';

import { GetAllNodesQuery } from '@modules/nodes/queries/get-all-nodes';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';

import { GetNodeUsageBodyDto, GetNodeUsageQueryDto } from './dtos';
import {
    GetNodeUsageResponseModel,
    GetStatsNodesUsersUsageResponseModel,
    GetStatsUserUsageResponseModel,
} from './models';
import { NodesUserUsageHistoryRepository } from './repositories/nodes-user-usage-history.repository';

@Injectable()
export class NodesUserUsageHistoryService {
    private readonly logger = new Logger(NodesUserUsageHistoryService.name);
    constructor(
        private readonly nodeUserUsageHistoryRepository: NodesUserUsageHistoryRepository,
        private readonly queryBus: QueryBus,
    ) {}

    public async getStatsUserUsage(
        userId: number,
        start: string,
        end: string,
        topNodesLimit: number,
    ): Promise<TResult<GetStatsUserUsageResponseModel>> {
        try {
            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic = await this.nodeUserUsageHistoryRepository.getUserDailyTrafficSum(
                BigInt(userId),
                startDate,
                endDate,
                dates,
            );

            const topNodes = await this.nodeUserUsageHistoryRepository.getTopUserNodesByTraffic(
                BigInt(userId),
                startDate,
                endDate,
                topNodesLimit,
            );

            const nodesUsage = await this.nodeUserUsageHistoryRepository.getUserNodesUsageByRange(
                BigInt(userId),
                startDate,
                endDate,
                dates,
            );

            return ok(
                new GetStatsUserUsageResponseModel({
                    categories: dates,
                    series: nodesUsage,
                    sparklineData: dailyTraffic,
                    topNodes: topNodes,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_USER_USAGE_BY_RANGE_ERROR);
        }
    }

    public async getStatsNodesUsersUsage(
        nodeUuid: string,
        start: string,
        end: string,
        topUsersLimit: number,
    ): Promise<TResult<GetStatsNodesUsersUsageResponseModel>> {
        try {
            const node = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));
            if (!node.isOk) {
                return fail(ERRORS.NODE_NOT_FOUND);
            }

            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic = await this.nodeUserUsageHistoryRepository.getNodeDailyTrafficSum(
                node.response.id,
                startDate,
                endDate,
                dates,
            );

            const topUsers = await this.nodeUserUsageHistoryRepository.getTopNodeUsersByTraffic(
                node.response.id,
                startDate,
                endDate,
                topUsersLimit,
            );

            return ok(
                new GetStatsNodesUsersUsageResponseModel({
                    categories: dates,
                    sparklineData: dailyTraffic,
                    topUsers: topUsers,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_USER_USAGE_BY_RANGE_ERROR);
        }
    }

    public async getStatsNodesUsersUsageByNodesUuids(
        nodesUuids: string[],
        start: string,
        end: string,
        topUsersLimit: number,
    ): Promise<TResult<GetStatsNodesUsersUsageResponseModel>> {
        try {
            const nodeIds = new Set<bigint>();

            const nodes = await this.queryBus.execute(new GetAllNodesQuery());
            if (!nodes.isOk) {
                return fail(ERRORS.INTERNAL_SERVER_ERROR);
            }

            for (const node of nodes.response) {
                if (nodesUuids.includes(node.uuid)) {
                    nodeIds.add(node.id);
                }
            }

            const { startDate, endDate, dates } = getDateRangeArrayUtil(
                dayjs.utc(start).startOf('day').toDate(),
                dayjs.utc(end).endOf('day').toDate(),
            );

            const dailyTraffic = await this.nodeUserUsageHistoryRepository.getNodesDailyTrafficSum(
                Array.from(nodeIds),
                startDate,
                endDate,
                dates,
            );

            const topUsers = await this.nodeUserUsageHistoryRepository.getTopNodesUsersByTraffic(
                Array.from(nodeIds),
                startDate,
                endDate,
                topUsersLimit,
            );

            return ok(
                new GetStatsNodesUsersUsageResponseModel({
                    categories: dates,
                    sparklineData: dailyTraffic,
                    topUsers: topUsers,
                }),
            );
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_USER_USAGE_BY_RANGE_ERROR);
        }
    }

    public async getNodeUsage(
        body: GetNodeUsageBodyDto,
        query: GetNodeUsageQueryDto,
    ): Promise<TResult<GetNodeUsageResponseModel>> {
        try {
            const { start, end, minTotalBytes } = query;
            const { nodesUuids } = body;

            const startDate = dayjs.utc(start).startOf('day').toDate();
            const endDate = dayjs.utc(end).endOf('day').toDate();

            const result = await this.nodeUserUsageHistoryRepository.getNodeUsage({
                nodesUuids,
                start: startDate,
                end: endDate,
                minTotalBytes,
            });

            return ok(new GetNodeUsageResponseModel(result));
        } catch (error) {
            this.logger.error(error);
            return fail(ERRORS.GET_USER_USAGE_BY_RANGE_ERROR);
        }
    }
}

import { Job } from 'bullmq';

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';

import { INodeConnectionOpts } from '@common/axios';
import { AxiosService } from '@common/axios/axios.service';
import { EVENTS } from '@libs/contracts/constants/events/events';

import { GetPluginByUuidQuery } from '@modules/node-plugins/queries/get-plugin-by-uuid';
import { GetNodeByUuidQuery } from '@modules/nodes/queries/get-node-by-uuid';
import { GetPortPlanNodeUuidsQuery } from '@modules/nodes/queries/get-port-plan-node-uuids';

import { UsersQueuesService } from '@queue/_users/users-queues.service';

import { QUEUES_NAMES } from '../../queue.enum';
import { NODES_JOB_NAMES } from '../constants';
import { NodeConfigurationService } from '../node-configuration.service';

@Processor(QUEUES_NAMES.NODES.PLUGINS, {
    concurrency: 20,
})
export class NodePluginsProcessor extends WorkerHost {
    private readonly logger = new Logger(NodePluginsProcessor.name);
    private readonly CONCURRENCY: number;

    constructor(
        private readonly axios: AxiosService,
        private readonly queryBus: QueryBus,
        private readonly usersQueuesService: UsersQueuesService,
        private readonly configurations: NodeConfigurationService,
    ) {
        super();
        this.CONCURRENCY = 20;
    }

    async process(job: Job) {
        switch (job.name) {
            case NODES_JOB_NAMES.SYNC_NODE_PLUGINS:
                return await this.handleSyncNodePlugins(job);
            case NODES_JOB_NAMES.COLLECT_REPORTS:
                return await this.handleCollectReports(job);
            default:
                this.logger.warn(`Job "${job.name}" is not handled.`);
                break;
        }
    }

    private async handleSyncNodePlugins(job: Job<{ nodeUuid: string }>) {
        try {
            const { nodeUuid } = job.data;
            const managed = await this.queryBus.execute(new GetPortPlanNodeUuidsQuery([nodeUuid]));
            if (managed.includes(nodeUuid)) {
                await this.configurations.apply({ nodeUuid });
                return;
            }

            const getNodeResult = await this.queryBus.execute(new GetNodeByUuidQuery(nodeUuid));

            if (!getNodeResult.isOk) {
                this.logger.error(`Failed to get node: ${getNodeResult.message}`);
                return {
                    success: false,
                    nodeUuid,
                    error: getNodeResult.message,
                };
            }

            const { response: node } = getNodeResult;

            const pluginUuid = node.activePluginUuid;

            if (!pluginUuid) {
                const response = await this.axios.syncNodePlugins(
                    {
                        plugin: null,
                    },
                    {
                        address: node.address,
                        port: node.port,
                        proxyUrl: node.proxyUrl,
                    },
                );

                if (!response.isOk || response.response.accepted !== true) {
                    const message = response.isOk
                        ? 'Node did not accept plugin removal'
                        : response.message;
                    this.logger.error(`Failed to sync node plugins: ${message}`);
                    return {
                        success: false,
                        nodeUuid,
                        error: message,
                    };
                }

                return;
            }

            const getNodePluginResult = await this.queryBus.execute(
                new GetPluginByUuidQuery(pluginUuid),
            );

            if (!getNodePluginResult.isOk) {
                this.logger.error(`Failed to get node plugin: ${getNodePluginResult.message}`);
                return;
            }

            const { response: nodePlugin } = getNodePluginResult;

            const syncNodePluginsResponse = await this.axios.syncNodePlugins(
                {
                    plugin: {
                        uuid: nodePlugin.uuid,
                        config: nodePlugin.pluginConfig as Record<string, unknown>,
                        name: nodePlugin.name,
                    },
                },
                {
                    address: node.address,
                    port: node.port,
                    proxyUrl: node.proxyUrl,
                },
            );

            if (
                !syncNodePluginsResponse.isOk ||
                syncNodePluginsResponse.response.accepted !== true
            ) {
                const message = syncNodePluginsResponse.isOk
                    ? 'Node did not accept the plugin configuration'
                    : syncNodePluginsResponse.message;
                this.logger.error(`Failed to sync node plugins: ${message}`);
                return { success: false, nodeUuid, error: message };
            }

            this.logger.log(`Node plugins synced successfully: ${nodeUuid}`);

            // TODO: retry

            return {
                success: true,
                nodeUuid,
            };
        } catch (error) {
            this.logger.error(`Failed to sync node plugins: ${error}`);
        }
    }

    private async handleCollectReports(
        job: Job<{
            nodeUuid: string;
            connectionOpts: INodeConnectionOpts;
        }>,
    ) {
        try {
            const { nodeUuid, connectionOpts } = job.data;

            const response = await this.axios.collectTorrentBlockerReports(connectionOpts);

            if (!response.isOk) {
                this.logger.error(`Failed to collect reports: ${response.message}`);

                return {
                    success: false,
                    nodeUuid,
                    collectedReports: [],
                };
            }

            const { response: collectedReports } = response;

            for (const report of collectedReports.reports) {
                await this.usersQueuesService.fireTorrentBlockerEvent({
                    id: report.actionReport.userId,
                    event: EVENTS.TORRENT_BLOCKER.REPORT,
                    nodeUuid,
                    report,
                });
            }

            return {
                success: true,
                nodeUuid,
                collectedReports,
            };
        } catch (error) {
            this.logger.error(`Failed to collect reports: ${error}`);
        }
    }
}

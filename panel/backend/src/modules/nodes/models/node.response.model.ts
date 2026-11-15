import { fromNanoToNumber } from '@common/utils/nano';
import { TNodeIps, TNodeControlAddresses } from '@libs/contracts/models';

import { ConfigProfileInboundEntity } from '@modules/config-profiles/entities';
import { InfraProviderEntity } from '@modules/infra-billing/entities';

import { NodesEntity } from '../entities';
import { INodeHotCache, INodeSystem, INodeVersions } from '../interfaces';

export class NodeResponseModel {
    public uuid: string;
    public id: number;
    public name: string;
    public address: string;
    public port: null | number;
    public proxyUrl: string | null;
    public hasProxy: boolean;
    public controlAddresses: TNodeControlAddresses;
    public controlRevision: string;
    public isConnected: boolean;
    public isConnecting: boolean;
    public isDisabled: boolean;
    public lastStatusChange: Date | null;
    public lastStatusMessage: null | string;
    public trafficResetDay: null | number;
    public consumptionMultiplier: number;
    public nodeConsumptionMultiplier: number;
    public isTrafficTrackingActive: boolean;
    public trafficLimitBytes: null | number;
    public trafficUsedBytes: null | number;
    public notifyPercent: null | number;
    public note: null | string;
    public viewPosition: number;
    public countryCode: string;
    public tags: string[];
    public integrationUuids: string[];
    public ips: TNodeIps;
    public createdAt: Date;
    public updatedAt: Date;

    public configProfile: {
        activeConfigProfileUuid: string | null;
        activeInbounds: ConfigProfileInboundEntity[];
    };
    public providerUuid: string | null;
    public provider: InfraProviderEntity | null;
    public activePluginUuid: string | null;

    public xrayUptime: number;
    public usersOnline: number;
    public system: INodeSystem | null;
    public versions: INodeVersions | null;

    constructor(data: NodesEntity, hotCache: INodeHotCache) {
        this.uuid = data.uuid;
        this.id = Number(data.id);
        this.name = data.name;
        this.address = data.address;
        this.port = data.port;
        this.proxyUrl = data.proxyUrl;
        this.hasProxy = !!data.proxyUrl;
        this.controlAddresses = data.controlAddresses;
        this.controlRevision = data.controlRevision;
        this.isConnected = data.isConnected;
        this.isConnecting = data.isConnecting;
        this.isDisabled = data.isDisabled;
        this.lastStatusChange = data.lastStatusChange;
        this.lastStatusMessage = data.lastStatusMessage;
        this.isTrafficTrackingActive = data.isTrafficTrackingActive;
        this.trafficResetDay = data.trafficResetDay;
        this.trafficLimitBytes = Number(data.trafficLimitBytes);
        this.trafficUsedBytes = Number(data.trafficUsedBytes);
        this.notifyPercent = data.notifyPercent;
        this.note = data.note;
        this.consumptionMultiplier = fromNanoToNumber(data.consumptionMultiplier);
        this.nodeConsumptionMultiplier = fromNanoToNumber(data.nodeConsumptionMultiplier);
        this.tags = data.tags;
        this.integrationUuids = data.integrationUuids;
        this.ips = data.ips;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;

        this.viewPosition = data.viewPosition;
        this.countryCode = data.countryCode;

        this.configProfile = {
            activeConfigProfileUuid: data.activeConfigProfileUuid,
            activeInbounds: data.activeInbounds,
        };

        this.providerUuid = data.providerUuid;
        this.provider = data.provider;
        this.activePluginUuid = data.activePluginUuid;

        const serving =
            data.isConnected &&
            !data.isDisabled &&
            !data.isConnecting &&
            (data.controlRevision === undefined ||
                hotCache.controlRevision === data.controlRevision);
        this.system = serving ? hotCache.system : null;
        this.usersOnline = serving ? hotCache.onlineUsers : 0;
        this.versions = hotCache.versions;
        this.xrayUptime = serving ? hotCache.xrayUptime : 0;
    }
}

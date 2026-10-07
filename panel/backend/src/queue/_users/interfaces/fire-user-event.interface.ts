import { TTorrentBlockerEvents, TUserEvents } from '@libs/contracts/constants';

import { IMetaInfo } from '@integration-modules/notifications/interfaces/meta-info.interface';

import { ITorrentBlockerReport } from '@modules/node-plugins/interfaces';

export interface IFireUserEventPayload {
    users: { id: bigint }[];
    userEvent: TUserEvents;
    skipTelegramNotification?: boolean;
    meta?: IMetaInfo;
}

export interface IFireUserEventJobData {
    id: string;
    meta?: IMetaInfo;
    userEvent: TUserEvents;
    skipTelegramNotification?: boolean;
}

export interface IFireTorrentBlockerEventJobData {
    event: TTorrentBlockerEvents;
    id: string;
    nodeUuid: string;
    report: ITorrentBlockerReport;
    skipTelegramNotification?: boolean;
}

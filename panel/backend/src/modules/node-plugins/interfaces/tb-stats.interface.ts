export interface IGetTopTorrentBlockerUser {
    userId: bigint;
    username: string;
    total: bigint;
}

export interface IGetTopTorrentBlockerNode {
    uuid: string;
    name: string;
    countryCode: string;
    total: bigint;
}

export interface IGetTopTorrentBlockerNodeConverted {
    uuid: string;
    color: string;
    name: string;
    countryCode: string;
    total: number;
}

export interface IGetTopTorrentBlockerUserConverted {
    userId: number;
    color: string;
    username: string;
    total: number;
}

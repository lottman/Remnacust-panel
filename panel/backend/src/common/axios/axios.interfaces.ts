export interface INodeRequestOpts {
    label: string;
    opts: INodeConnectionOpts;
    path: string;
    data?: unknown;
    compress?: boolean;
    handle500?: boolean;
    internalError?: boolean;
    logAxiosError?: boolean;
    method?: 'get' | 'post';
    timeout?: number;
}

export type INodeStartResponse = Omit<
    import('@remnawave/node-contract').StartXrayCommand.Response['response'],
    'system'
> & {
    system:
        | import('@remnawave/node-contract').StartXrayCommand.Response['response']['system']
        | null;
};

export type INodeSystemStatsResponse = Omit<
    import('@remnawave/node-contract').GetSystemStatsCommand.Response['response'],
    'system' | 'plugins'
> & {
    system:
        | import('@remnawave/node-contract').GetSystemStatsCommand.Response['response']['system']
        | null;
    plugins?: import('@remnawave/node-contract').GetSystemStatsCommand.Response['response']['plugins'];
};

export interface INodeConnectionOpts {
    address: string;
    port: number | null;
    proxyUrl: string | null;
}

export interface IMtlsOptions {
    ca: string;
    cert: string;
    key: string;
}

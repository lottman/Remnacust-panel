import type {
    GetConfigProfilesCommand,
    GetHostsCommand,
    GetNodesCommand
} from '@remnawave/backend-contract'

const uuid = (n: number) => `0587cad8-1305-4127-ab2a-${String(n).padStart(12, '0')}`
export const profileUuid = uuid(1)
export const inboundUuid = uuid(2)
export const templateUuid = uuid(3)
const offlineUuid = uuid(4)
const inbound = {
    uuid: inboundUuid,
    profileUuid,
    tag: 'vless-current',
    type: 'vless',
    network: 'tcp',
    security: 'none',
    port: 443,
    rawInbound: { tag: 'vless-current', protocol: 'vless', port: 443 }
}
export const profiles = [
    { uuid: profileUuid, name: 'Existing profile', inbounds: [inbound] },
    {
        uuid: uuid(5),
        name: 'Moved inbound profile',
        inbounds: [{ ...inbound, uuid: uuid(6), profileUuid: uuid(7) }]
    },
    { uuid: uuid(8), name: '  ', inbounds: [{ ...inbound, uuid: uuid(9), profileUuid: uuid(8) }] }
] as GetConfigProfilesCommand.Response['response']['configProfiles']

const basic = {
    remark: 'Basic host',
    address: 'shared.example.test',
    port: 443,
    inbound: { configProfileUuid: profileUuid, configProfileInboundUuid: inboundUuid },
    nodes: [],
    tags: [],
    isDisabled: false,
    isHidden: false,
    alwaysAvailable: false,
    internalSquads: { mode: 'EXCEPT', squads: [] },
    serverDescription: null,
    finalMask: null,
    muxParams: null,
    sockoptParams: null,
    xrayJsonTemplateUuid: null,
    sni: '',
    host: '',
    path: '',
    fingerprint: null,
    alpn: null,
    securityLayer: 'DEFAULT',
    allowInsecure: false,
    shuffleHost: false,
    vlessRouteId: null,
    mihomoXhttpExtraParams: null,
    serverName: null,
    speedLimit: 0,
    trafficLimitBytes: null,
    trafficResetStrategy: null,
    userLimit: 0,
    hideFromInvalidUsers: false,
    vlessEncryption: null,
    forceHost: false,
    addressMode: 'manual',
    autoselect: null,
    mRatio: 1,
    connectionType: 'MANUAL'
}
export const cases = [
    { id: 'basic', ...basic },
    {
        id: 'rules',
        ...basic,
        remark: 'Five icons',
        internalSquads: { mode: 'ALLOW_ONLY', squads: [uuid(10)] },
        xrayJsonTemplateUuid: templateUuid,
        muxParams: { enabled: true },
        finalMask: { type: 'test' },
        sockoptParams: { tcpNoDelay: true }
    },
    {
        id: 'invalid',
        ...basic,
        remark: 'Removed inbound',
        inbound: { ...basic.inbound, configProfileInboundUuid: uuid(11) }
    },
    {
        id: 'moved',
        ...basic,
        remark: 'Moved inbound',
        inbound: { configProfileUuid: uuid(5), configProfileInboundUuid: uuid(6) }
    },
    {
        id: 'deleted',
        ...basic,
        remark: 'Deleted profile',
        inbound: { configProfileUuid: uuid(12), configProfileInboundUuid: uuid(13) }
    },
    { id: 'disabled', ...basic, remark: 'Valid disabled', isDisabled: true },
    { id: 'offline', ...basic, remark: 'Valid offline node', nodes: [offlineUuid] },
    {
        id: 'whitespace',
        ...basic,
        remark: 'Whitespace label',
        inbound: { configProfileUuid: uuid(8), configProfileInboundUuid: uuid(9) }
    },
    {
        id: 'ipv6',
        ...basic,
        remark: 'Long IPv6',
        address: '2001:db8:aaaa:bbbb:cccc:dddd:eeee:ffff'
    },
    {
        id: 'dns',
        ...basic,
        remark: 'Long DNS',
        address: 'a-very-long-synthetic-hostname-for-layout-checks.internal.example.test'
    }
].map((item, index) => ({ ...item, uuid: uuid(100 + index), viewPosition: index }))
export const hosts = cases as unknown as GetHostsCommand.Response['response']
export const nodes = [
    {
        uuid: offlineUuid,
        name: 'Offline node',
        countryCode: 'US',
        isConnected: false,
        provider: null
    }
] as GetNodesCommand.Response['response']
export const modalCalls: Array<{ id: string; args: unknown }> = []
export const openedUrls: string[] = []
export function showModal(id: string, args: unknown) {
    modalCalls.push({ id, args })
    return Promise.resolve()
}
export const useGetHosts = () => ({ data: hosts })
export const useGetNodes = () => ({ data: nodes })
export const useGetInternalSquads = () => ({
    data: { internalSquads: [{ uuid: uuid(10), name: 'Test squad' }] }
})
export const useGetSubscriptionTemplates = () => ({
    data: { templates: [{ uuid: templateUuid, name: 'Test template' }] }
})

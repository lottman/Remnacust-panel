import { translateUiText as uiText } from '@shared/i18n/interface-text'
export const SWATCHES = [
    'rgb(21, 170, 191)',
    'rgb(167, 139, 250)',
    'rgb(56, 189, 248)',
    'rgb(251, 146, 60)',
    'rgb(52, 211, 153)',
    'rgb(244, 114, 182)',
    'rgb(250, 204, 21)',
    'rgb(239, 68, 68)',
    'rgb(45, 212, 191)',
    'rgb(192, 132, 252)',
    'rgb(251, 191, 36)',
    'rgb(74, 222, 128)',
    'rgb(249, 115, 22)',
    'rgb(236, 72, 153)',
    'rgb(99, 102, 241)',
    'rgb(14, 165, 233)'
]

export type CardSection = 'infra' | 'month' | 'stats'

export const CARD_SECTIONS: { label: string; value: CardSection }[] = [
    {
        get label() {
            return uiText('nodes-traffic-84537ea')
        },
        value: 'stats'
    },
    {
        get label() {
            return uiText('this-month-6436773')
        },
        value: 'month'
    },
    {
        get label() {
            return uiText('infrastructure-ce0cff7')
        },
        value: 'infra'
    }
]

export const DEFAULT_SECTIONS: CardSection[] = ['stats', 'month', 'infra']

export type BgStyle = 'dots' | 'gradient' | 'grid' | 'solid'

export const BG_STYLES: { label: string; value: BgStyle }[] = [
    {
        get label() {
            return uiText('solid-b8b311b')
        },
        value: 'solid'
    },
    {
        get label() {
            return uiText('gradient-2523561')
        },
        value: 'gradient'
    },
    {
        get label() {
            return uiText('dots-6de335f')
        },
        value: 'dots'
    },
    {
        get label() {
            return uiText('grid-0d7d12a')
        },
        value: 'grid'
    }
]

export type MaskableField =
    | 'countries'
    | 'cpuCores'
    | 'monthTraffic'
    | 'monthUsers'
    | 'nodes'
    | 'ram'
    | 'totalTraffic'
    | 'totalUsers'

export const MASKABLE_FIELDS: { label: string; value: MaskableField }[] = [
    {
        get label() {
            return uiText('users-6b0cc90')
        },
        value: 'totalUsers'
    },
    {
        get label() {
            return uiText('nodes-7ac3620')
        },
        value: 'nodes'
    },
    {
        get label() {
            return uiText('traffic-4876efb')
        },
        value: 'totalTraffic'
    },
    {
        get label() {
            return uiText('new-users-bdbdb86')
        },
        value: 'monthUsers'
    },
    {
        get label() {
            return uiText('month-traffic-0654a8f')
        },
        value: 'monthTraffic'
    },
    {
        get label() {
            return uiText('countries-8faf7ec')
        },
        value: 'countries'
    },
    {
        get label() {
            return uiText('cpu-cores-5dbed0b')
        },
        value: 'cpuCores'
    },
    { label: 'RAM', value: 'ram' }
]

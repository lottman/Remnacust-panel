import type { IconType } from 'react-icons'

import { SiLitecoin, SiSolana, SiTon } from 'react-icons/si'
import { TbCurrencyBitcoin, TbCurrencyEthereum } from 'react-icons/tb'

const TronIcon: IconType = (props) => (
    // TRON's triangular network mark, drawn locally without external requests.
    <svg
        {...props}
        width={props.size ?? 24}
        height={props.size ?? 24}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
    >
        <path
            d="M3 3 21 7 12 22 3 3Zm0 0 11 9 7-5M14 12l-2 10M3 3l11 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
        />
    </svg>
)

export const SUPPORT_WALLETS = [
    {
        id: 'gram',
        name: 'Gram',
        network: 'TON',
        icon: SiTon,
        color: '#0098ea',
        address: 'UQAySFzPDsY761_ohuu8W2bZETKqQ_dRelka6UpKM743It1T'
    },
    {
        id: 'solana',
        name: 'Solana',
        network: 'Solana',
        icon: SiSolana,
        color: '#9945ff',
        address: '2jyRRzyBUnqDSTSa5MXjTGEguZfswS85YmU7R3asbwk5'
    },
    {
        id: 'trc20',
        name: 'TRC20',
        network: 'TRON · TRC20',
        icon: TronIcon,
        color: '#eb4248',
        address: 'TAauwimpjjpVqtLtCYZ5bQsvhNLFRNEfYx'
    },
    {
        id: 'litecoin',
        name: 'Litecoin',
        network: 'Litecoin',
        icon: SiLitecoin,
        color: '#345d9d',
        address: 'LRY8kbZgwoYbWEdiVKuJ6Dpe5zxSQizy46'
    },
    {
        id: 'ethereum',
        name: 'Ethereum',
        network: 'Ethereum',
        icon: TbCurrencyEthereum,
        color: '#627eea',
        address: '0xE58bdB564f9Bf4142a49bf9be038a1C3A9B6Ad9f'
    },
    {
        id: 'bitcoin',
        name: 'Bitcoin',
        network: 'Bitcoin',
        icon: TbCurrencyBitcoin,
        color: '#f7931a',
        address: 'bc1qkc76tk6rxnqctc8qeerkm4x5wqdw3nvuzqj3md'
    }
] as const

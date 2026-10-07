import { createTheme } from '@mantine/core'

import { variantColorResolver } from './colors-resolver'
import components from './overrides'

export const theme = createTheme({
    variantColorResolver,
    components,
    cursorType: 'pointer',
    fontFamily:
        'Manrope, Vazirmatn, Noto Sans SC, Apple Color Emoji, Twemoji Country Flags, sans-serif',
    fontFamilyMonospace: 'Fira Mono, monospace',
    breakpoints: {
        xs: '30em',
        sm: '40em',
        md: '48em',
        lg: '64em',
        xl: '80em',
        '2xl': '96em',
        '3xl': '120em',
        '4xl': '160em'
    },

    scale: 1,
    fontSmoothing: true,
    focusRing: 'auto',
    white: '#ffffff',
    black: '#24292f',
    colors: {
        dark: [
            '#c9d1d9',
            '#b1bac4',
            '#8b949e',
            '#6e7681',
            '#484f58',
            '#30363d',
            '#21262d',
            '#161b22',
            '#0d1117',
            '#010409'
        ],
        'shaded-gray': [
            '#f5f5f5',
            '#e8e8e8',
            '#d4d4d4',
            '#c0c0c0',
            '#a8a8a8',
            '#a0a0a0',
            '#808080',
            '#686868',
            '#505050',
            '#383838'
        ]
    },
    primaryShade: 8,
    primaryColor: 'cyan',
    autoContrast: true,
    luminanceThreshold: 0.3,
    radius: { xs: '4px', sm: '6px', md: '8px', lg: '14px', xl: '18px' },
    fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '20px' },
    headings: {
        fontWeight: '700',
        sizes: {
            h1: { fontSize: '32px', lineHeight: '1.2' },
            h2: { fontSize: '28px', lineHeight: '1.25' },
            h3: { fontSize: '22px', lineHeight: '1.3' },
            h4: { fontSize: '18px', lineHeight: '1.35' },
            h5: { fontSize: '16px', lineHeight: '1.4' },
            h6: { fontSize: '13px', lineHeight: '1.5' }
        }
    },
    defaultRadius: 'md'
})

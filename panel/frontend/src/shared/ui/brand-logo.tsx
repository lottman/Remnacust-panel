import { Box, Image } from '@mantine/core'
import { useState } from 'react'

import { Logo } from './logo'

interface BrandLogoProps {
    logoUrl?: string | null
    size?: number
    retryKey?: number
    onError?: () => void
    onLoad?: () => void
}

function BrandImage({ logoUrl, size = 30, onError, onLoad }: BrandLogoProps) {
    const [failed, setFailed] = useState(false)

    return (
        <Box
            component="span"
            style={{ display: 'inline-flex', flexShrink: 0, width: size, height: size }}
        >
            {logoUrl && !failed ? (
                <Image
                    alt=""
                    fit="contain"
                    src={logoUrl}
                    w={size}
                    h={size}
                    onLoad={onLoad}
                    onError={() => {
                        setFailed(true)
                        onError?.()
                    }}
                />
            ) : (
                <Logo aria-hidden="true" c="brand.5" size={size} />
            )}
        </Box>
    )
}

export function BrandLogo({ retryKey = 0, ...props }: BrandLogoProps) {
    return <BrandImage key={`${props.logoUrl ?? ''}:${retryKey}`} {...props} />
}

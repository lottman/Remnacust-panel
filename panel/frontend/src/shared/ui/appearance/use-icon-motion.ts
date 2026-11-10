import { useEffect } from 'react'

import { installIconMotion } from './icon-motion'

export function useIconMotion(reducedMotion: boolean) {
    useEffect(() => (reducedMotion ? undefined : installIconMotion(document)), [reducedMotion])
}

import { lazy } from 'react'

import { loadWithAssetRecovery } from './asset-recovery'

type LazyComponent = Awaited<ReturnType<Parameters<typeof lazy>[0]>>['default']

export function lazyWithRecovery<T extends LazyComponent>(load: () => Promise<{ default: T }>) {
    return lazy(() => loadWithAssetRecovery(load))
}

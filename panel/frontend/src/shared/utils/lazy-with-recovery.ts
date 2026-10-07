import { ComponentType, lazy } from 'react'

import { loadWithAssetRecovery } from './asset-recovery'

export function lazyWithRecovery<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
    return lazy(() => loadWithAssetRecovery(load))
}

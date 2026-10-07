import { createRoot } from 'react-dom/client'

import { installStaleAssetRecovery } from '@shared/utils/recover-stale-assets'

import { App } from './app'

installStaleAssetRecovery()

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

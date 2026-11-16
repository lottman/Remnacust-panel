import '@mantine/core/styles.css'
import '../../../src/global.css'
import NiceModal from '@ebay/nice-modal-react'
import { MantineProvider, DirectionProvider, Button } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { QueryClientProvider } from '@tanstack/react-query'
import i18next from 'i18next'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import { EditNodeModal } from '../../../src/shared/_modals/nodes/edit-node-modal/edit-node.modal'
import { theme } from '../../../src/shared/constants/theme/theme'
import { queryClient, scan, node } from './api'
const lang = new URLSearchParams(location.search).get('lang') ?? 'en'
await i18next.init({
    lng: lang,
    fallbackLng: 'en',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([k, v]) => [k, { translation: v }])
    )
})
NiceModal.register('fixture-edit', EditNodeModal)
;(window as unknown as { nodeWizardFixture: unknown }).nodeWizardFixture = {
    scan,
    i18n: i18next,
    open: () => NiceModal.show('fixture-edit', { nodeUuid: node.uuid })
}
createRoot(document.getElementById('root')!).render(
    <DirectionProvider initialDirection={lang === 'fa' ? 'rtl' : 'ltr'}>
        <MantineProvider theme={theme} forceColorScheme="dark">
            <I18nextProvider i18n={i18next}>
                <QueryClientProvider client={queryClient}>
                    <ModalsProvider>
                        <NiceModal.Provider>
                            <Button
                                onClick={() =>
                                    NiceModal.show('fixture-edit', { nodeUuid: node.uuid })
                                }
                            >
                                Open edit
                            </Button>
                        </NiceModal.Provider>
                    </ModalsProvider>
                </QueryClientProvider>
            </I18nextProvider>
        </MantineProvider>
    </DirectionProvider>
)

import '@mantine/core/styles.css'
import '@mantine/code-highlight/styles.css'
import '../../../src/global.css'
import {
    Button,
    DirectionProvider,
    Drawer,
    Group,
    MantineProvider,
    Stack,
    Tabs,
    Transition
} from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import i18next from 'i18next'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'

import en from '../../../public/locales/en/remnawave.json'
import fa from '../../../public/locales/fa/remnawave.json'
import ru from '../../../public/locales/ru/remnawave.json'
import zh from '../../../public/locales/zh/remnawave.json'
import { LocaleDirectionSync } from '../../../src/app/i18n/locale-direction-sync'
import { theme } from '../../../src/shared/constants/theme/theme'
import { CustomRemarksEditor } from '../../../src/shared/ui/forms/custom-remarks/custom-remarks-editor'
import {
    defaultRemarks,
    type CustomRemarks
} from '../../../src/shared/ui/forms/custom-remarks/remarks-editor.utils'
import { setSquadStatus } from './browser-support'

await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: Object.fromEntries(
        Object.entries({ en, ru, fa, zh }).map(([key, value]) => [key, { translation: value }])
    ),
    interpolation: { escapeValue: false }
})

document.documentElement.classList.add('panel-themed')
document.documentElement.style.cssText =
    '--panel-background:#0d1117;--panel-surface:#161b22;--panel-text:#c9d1d9;--panel-muted:#8b949e;--panel-border:#30363d;--panel-subtle:#21262d;--panel-elevated:#21262d;--panel-accent-text:#58a6ff'
function App() {
    const [remote, setRemote] = useState<CustomRemarks>(defaultRemarks)
    const [squad, setSquad] = useState<CustomRemarks | null>(null)
    const [tab, setTab] = useState<string | null>('remarks')
    const [drawer, setDrawer] = useState(false)
    const [drawerTab, setDrawerTab] = useState<string | null>('remarks')
    const [failSave, setFailSave] = useState(false)
    const [saved, setSaved] = useState('[]')
    const save = async (value: CustomRemarks | null, external = false) => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        if (failSave) throw new Error('Fixture save failed')
        setSaved(JSON.stringify(value))
        if (external) setSquad(value)
        else if (value) setRemote(value)
        return value
    }
    const language = async (value: string) => {
        await i18next.changeLanguage(value)
    }
    return (
        <Stack p="md">
            <Group>
                {['en', 'ru', 'fa', 'zh'].map((value) => (
                    <Button key={value} onClick={() => void language(value)}>
                        {value}
                    </Button>
                ))}
                <Button onClick={() => setRemote(structuredClone(remote))}>Equal refetch</Button>
                <Button onClick={() => setRemote({ ...remote, expiredUsers: ['Remote update'] })}>
                    Remote change
                </Button>
                <Button onClick={() => setFailSave(!failSave)}>
                    Save failure: {String(failSave)}
                </Button>
                <Button onClick={() => setDrawer(true)}>External squad</Button>
                <Button onClick={() => setSquadStatus('loading')}>Loading squads</Button>
                <Button onClick={() => setSquadStatus('error')}>Squad error</Button>
            </Group>
            <Tabs value={tab} onChange={setTab} keepMountedMode="display-none">
                <Tabs.List>
                    <Tabs.Tab value="remarks">Remarks fixture</Tabs.Tab>
                    <Tabs.Tab value="other">Other fixture</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="remarks" pt="md">
                    <CustomRemarksEditor
                        value={remote}
                        isPending={false}
                        onSave={(value) => save(value)}
                    />
                </Tabs.Panel>
                <Tabs.Panel value="other">Other settings</Tabs.Panel>
            </Tabs>
            <Drawer
                opened={drawer}
                onClose={() => setDrawer(false)}
                size={600}
                title="External squad fixture"
            >
                <Tabs value={drawerTab} onChange={setDrawerTab} keepMountedMode="display-none">
                    <Tabs.List>
                        <Tabs.Tab value="remarks">Squad remarks</Tabs.Tab>
                        <Tabs.Tab value="other">Squad other</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="remarks">
                        <Transition
                            keepMounted
                            keepMountedMode="display-none"
                            duration={200}
                            mounted={drawerTab === 'remarks'}
                            transition="fade"
                        >
                            {(styles) => (
                                <div style={styles}>
                                    <CustomRemarksEditor
                                        external
                                        value={squad}
                                        inherited={remote}
                                        isPending={false}
                                        onSave={(value) => save(value, true)}
                                    />
                                </div>
                            )}
                        </Transition>
                    </Tabs.Panel>
                    <Tabs.Panel value="other">Other squad settings</Tabs.Panel>
                </Tabs>
            </Drawer>
            <output hidden data-testid="saved-payload">
                {saved}
            </output>
        </Stack>
    )
}
const browserWindow = window as Window & { remarksFixtureRoot?: ReturnType<typeof createRoot> }
const root = (browserWindow.remarksFixtureRoot ??= createRoot(document.getElementById('root')!))
root.render(
    <I18nextProvider i18n={i18next}>
        <DirectionProvider>
            <MantineProvider theme={theme} forceColorScheme="dark">
                <LocaleDirectionSync />
                <ModalsProvider>
                    <App />
                </ModalsProvider>
            </MantineProvider>
        </DirectionProvider>
    </I18nextProvider>
)

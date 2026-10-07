import { Button, Divider, Group, px, Stack, Tabs, Text, Transition } from '@mantine/core'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiKey } from 'react-icons/pi'
import { TbFingerprint, TbKey, TbLock, TbSignature } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { CopyableAreaShared } from '@shared/ui/copyable-area/copyable-area'
import { CopyableFieldShared } from '@shared/ui/copyable-field/copyable-field'

import { generateMlDsa65, generateMlKem768, generateX25519 } from './keypair-utils'
import { generateShortId } from './short-id'

const enum TabTypes {
    ML_DSA65 = 'ml-dsa65',
    ML_KEM768 = 'ml-kem768',
    X25519 = 'x25519',
    SHORT_ID = 'short-id'
}

export const KeypairGeneratorWidget = () => {
    const uiText = useUiText()

    const { t } = useTranslation()

    const [activeTab, setActiveTab] = useState<TabTypes>(TabTypes.X25519)

    const [keyPair, setKeyPair] = useState(generateX25519)
    const [mlDsa65KeyPair, setMlDsa65KeyPair] = useState(generateMlDsa65)
    const [mlKem768KeyPair, setMlKem768KeyPair] = useState(generateMlKem768)
    const [shortId, setShortId] = useState(generateShortId)

    return (
        <Stack gap="lg">
            <Tabs
                keepMounted
                keepMountedMode="display-none"
                onChange={(value) => value && setActiveTab(value as TabTypes)}
                value={activeTab}
            >
                <Tabs.List grow mb="md" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <Tabs.Tab
                        key={TabTypes.X25519}
                        leftSection={<TbKey size={16} />}
                        value={TabTypes.X25519}
                    >
                        X25519
                    </Tabs.Tab>

                    <Tabs.Tab
                        key={TabTypes.ML_DSA65}
                        leftSection={<TbSignature size={16} />}
                        value={TabTypes.ML_DSA65}
                    >
                        ML-DSA65
                    </Tabs.Tab>

                    <Tabs.Tab
                        key={TabTypes.ML_KEM768}
                        leftSection={<TbLock size={16} />}
                        value={TabTypes.ML_KEM768}
                    >
                        ML-KEM768
                    </Tabs.Tab>
                    <Tabs.Tab leftSection={<TbFingerprint size={16} />} value={TabTypes.SHORT_ID}>
                        Short ID
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value={TabTypes.SHORT_ID}>
                    <Transition duration={200} keepMounted mounted={activeTab === TabTypes.SHORT_ID} transition="fade">
                        {(styles) => (
                            <Stack gap="md" style={styles}>
                                <CopyableFieldShared label="shortId" value={shortId} />
                                <Text c="dimmed" size="xs">{t('keypair-generator.widget.short-id-help')}</Text>
                                <CopyableAreaShared
                                    label={t('keypair-generator.widget.server-config')}
                                    value={`"shortIds": ["${shortId}"]`}
                                />
                                <Group justify="flex-end">
                                    <Button leftSection={<TbFingerprint size={16} />} onClick={() => setShortId(generateShortId())} size="sm" variant="default">
                                        {t('keypair-generator.widget.generate')}
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </Transition>
                </Tabs.Panel>

                <Tabs.Panel value={TabTypes.X25519}>
                    <Transition
                        duration={200}
                        keepMounted
                        mounted={activeTab === TabTypes.X25519}
                        timingFunction="linear"
                        transition="fade"
                    >
                        {(styles) => (
                            <Stack gap="md" style={styles}>
                                <Stack gap="xs">
                                    <CopyableFieldShared
                                        label={uiText('password-e7cf3ef')}
                                        value={keyPair.password}
                                    />
                                    <CopyableFieldShared
                                        label={uiText('public-key-f569a86')}
                                        value={keyPair.publicKey}
                                    />
                                    <CopyableFieldShared
                                        label={uiText('private-key-b593dff')}
                                        value={keyPair.privateKey}
                                    />
                                </Stack>
                                <Text c="dimmed" size="xs">
                                    {t('keypair-generator.widget.public-key-help')}
                                </Text>

                                <Divider />

                                <Stack gap="xs">
                                    <CopyableAreaShared
                                        autosize
                                        minRows={3}
                                        label={t('keypair-generator.widget.all-values')}
                                        value={`"password": "${keyPair.password}",
"publicKey": "${keyPair.publicKey}",
"privateKey": "${keyPair.privateKey}",`}
                                    />
                                </Stack>

                                <Group justify="flex-end">
                                    <Button
                                        leftSection={<PiKey size={px('1.2rem')} />}
                                        onClick={() => setKeyPair(generateX25519)}
                                        size="sm"
                                        variant="default"
                                    >
                                        {t('keypair-generator.widget.generate')}
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </Transition>
                </Tabs.Panel>

                <Tabs.Panel value={TabTypes.ML_DSA65}>
                    <Transition
                        duration={200}
                        keepMounted
                        mounted={activeTab === TabTypes.ML_DSA65}
                        timingFunction="linear"
                        transition="fade"
                    >
                        {(styles) => (
                            <Stack gap="md" style={styles}>
                                <Stack gap="xs">
                                    <CopyableFieldShared
                                        label={uiText('mldsa65seed-server-side-ad97048')}
                                        value={mlDsa65KeyPair.mldsa65Seed}
                                    />

                                    <CopyableFieldShared
                                        label={uiText('mldsa65verify-client-side-pqv-a5843b5')}
                                        value={mlDsa65KeyPair.mldsa65Verify}
                                    />
                                </Stack>

                                <Divider />

                                <Stack gap="xs">
                                    <CopyableAreaShared
                                        label={uiText('both-keys-8256d94')}
                                        value={`"mldsa65Seed": "${mlDsa65KeyPair.mldsa65Seed}", 
"mldsa65Verify": "${mlDsa65KeyPair.mldsa65Verify}",`}
                                    />
                                </Stack>
                                <Group justify="flex-end">
                                    <Button
                                        leftSection={<PiKey size={px('1.2rem')} />}
                                        onClick={() => setMlDsa65KeyPair(generateMlDsa65)}
                                        size="sm"
                                        variant="default"
                                    >
                                        {t('keypair.widget.generate-key-pair')}
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </Transition>
                </Tabs.Panel>

                <Tabs.Panel value={TabTypes.ML_KEM768}>
                    <Transition
                        duration={200}
                        keepMounted
                        mounted={activeTab === TabTypes.ML_KEM768}
                        timingFunction="linear"
                        transition="fade"
                    >
                        {(styles) => (
                            <Stack gap="md" style={styles}>
                                <Stack gap="xs">
                                    <CopyableFieldShared
                                        label={uiText('server-side-used-in-decryption-d0768f2')}
                                        value={mlKem768KeyPair.mlkem768Seed}
                                    />

                                    <CopyableFieldShared
                                        label={uiText('client-side-used-in-encryption-c5871bc')}
                                        value={mlKem768KeyPair.mlkem768PublicKey}
                                    />
                                </Stack>

                                <Group justify="flex-end">
                                    <Button
                                        leftSection={<PiKey size={px('1.2rem')} />}
                                        onClick={() => setMlKem768KeyPair(generateMlKem768)}
                                        size="sm"
                                        variant="default"
                                    >
                                        {t('keypair.widget.generate-key-pair')}
                                    </Button>
                                </Group>
                            </Stack>
                        )}
                    </Transition>
                </Tabs.Panel>
            </Tabs>
        </Stack>
    )
}

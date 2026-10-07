import type { GetNodeCommand } from '@remnawave/backend-contract'

import { Alert, Button, Checkbox, Modal, Stack, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { TbCloudDownload } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { useUiText } from '@shared/i18n/interface-text'

export function NodeUpgradeFeature({ node }: { node: GetNodeCommand.Response['response'] }) {
    const uiText = useUiText()

    const [opened, { open, close }] = useDisclosure()
    const [directory, setDirectory] = useState('/opt/remnanode')
    const [confirmation, setConfirmation] = useState<string | null>(null)
    const fingerprint = JSON.stringify([node.uuid, directory.trim()])
    const valid =
        directory.trim().startsWith('/') &&
        directory.trim().length > 1 &&
        directory.length <= 1024 &&
        !Array.from(directory).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    return (
        <>
            <Button
                variant="light"
                leftSection={<TbCloudDownload size={18} />}
                onClick={() => {
                    setConfirmation(null)
                    open()
                }}
            >
                {uiText('update-node-6216b74')}
            </Button>
            <Modal
                opened={opened}
                onClose={close}
                centered
                title={uiText('update-node-value-9c42315', { value1: node.name })}
                closeButtonProps={{
                    'aria-label': uiText('close-node-update-9f7e455')
                }}
            >
                <Stack gap="md">
                    <TextInput
                        label={uiText('node-directory-87cd969')}
                        value={directory}
                        maxLength={1024}
                        description={uiText('directory-containing-docker-compose-yml-953b8bd')}
                        onChange={(event) => setDirectory(event.currentTarget.value)}
                    />
                    <Alert color="cyan">
                        {uiText(
                            'installs-the-latest-node-image-and-core-over-ssh-requires-root-d74d053'
                        )}
                    </Alert>
                    <Checkbox
                        checked={confirmation === fingerprint}
                        onChange={(event) =>
                            setConfirmation(event.currentTarget.checked ? fingerprint : null)
                        }
                        label={uiText('update-this-node-and-restart-connections-1de075b')}
                    />
                    <Button
                        disabled={!valid || confirmation !== fingerprint}
                        onClick={() => {
                            void showModal('nodes_nodeSshTerminal', {
                                node,
                                nodeUpgrade: {
                                    id: crypto.randomUUID(),
                                    directory: directory.trim()
                                }
                            })
                            close()
                        }}
                    >
                        {uiText('continue-over-ssh-f266499')}
                    </Button>
                </Stack>
            </Modal>
        </>
    )
}

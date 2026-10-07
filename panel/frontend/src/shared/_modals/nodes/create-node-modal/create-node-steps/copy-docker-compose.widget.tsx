import { Button, CopyButton, Skeleton, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { PiCheck } from 'react-icons/pi'
import { SiDocker } from 'react-icons/si'

import { useGetNodeSecretKey } from '@shared/api/hooks'

interface IProps {
    port?: number
}

export const CopyDockerComposeWidget = ({ port }: IProps) => {
    const { data: secretKey, isLoading: isSecretKeyLoading } = useGetNodeSecretKey()
    const { t } = useTranslation()

    if (isSecretKeyLoading || !secretKey) {
        return <Skeleton height={40} />
    }

    const generateDockerCompose = (port?: number) => {
        return `services:
  remnanode:
    container_name: remnanode
    hostname: remnanode
    image: remnacust-node:1.1.1
    network_mode: host
    restart: always
    volumes:
      - remnanode-core:/var/lib/remnawave/core-manager
    cap_add:
      - NET_ADMIN
    ulimits:
      nofile:
        soft: 1048576
        hard: 1048576
    environment:
      NODE_PORT: ${port ?? 2222}
      SECRET_KEY: ${JSON.stringify(secretKey.secretKey.trimEnd().replaceAll('$', '$$'))}
volumes:
  remnanode-core:`
    }

    return (
        <Stack gap="xs" mt="lg">
            <Text c="dimmed" size="xs">
                {t('copy-docker-compose.widget.local-image-note')}
            </Text>
            <CopyButton timeout={2000} value={generateDockerCompose(port)}>
                {({ copied, copy }) => (
                    <Button
                        color={copied ? 'teal' : 'gray'}
                        fullWidth
                        leftSection={copied ? <PiCheck size={18} /> : <SiDocker size={18} />}
                        onClick={copy}
                        size="md"
                    >
                        {t('copy-docker-compose.widget.copy-docker-compose-yml')}
                    </Button>
                )}
            </CopyButton>
        </Stack>
    )
}

import { ActionIcon, CopyButton, Textarea } from '@mantine/core'
import { PiCheck, PiCopy } from 'react-icons/pi'

export const CopyableAreaShared = ({
    autosize = false,
    label,
    minRows = 2,
    value
}: {
    autosize?: boolean
    label?: string
    minRows?: number
    value: number | string
}) => {
    return (
        <CopyButton timeout={2000} value={value.toString()}>
            {({ copied, copy }) => (
                <Textarea
                    autosize={autosize}
                    label={label}
                    minRows={minRows}
                    onClick={copy}
                    readOnly
                    rightSection={
                        <ActionIcon
                            color={copied ? 'teal' : 'gray'}
                            onClick={copy}
                            variant="subtle"
                        >
                            {copied ? <PiCheck size="16px" /> : <PiCopy size="16px" />}
                        </ActionIcon>
                    }
                    styles={{
                        input: {
                            cursor: 'copy',
                            fontFamily: 'monospace'
                        }
                    }}
                    value={value.toString()}
                />
            )}
        </CopyButton>
    )
}

import { ActionIcon, CopyButton, Input } from '@mantine/core'
import { useId } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { PiCheck, PiCopy } from 'react-icons/pi'

import classes from './copyable-field.module.css'

export const CopyableFieldShared = ({
    label,
    value,
    leftSection,
    size,
    type = 'text'
}: {
    label?: React.ReactNode | string
    leftSection?: React.ReactNode
    size?: 'lg' | 'md' | 'sm' | 'xl' | 'xs'
    value: number | string
    type?: 'text' | 'password'
}) => {
    const id = useId()
    const { t } = useTranslation()
    return (
        <CopyButton timeout={2000} value={value.toString()}>
            {({ copied, copy }) => (
                <Input.Wrapper id={id} label={label}>
                    <div className={classes.inputWrapper}>
                        <Input
                            id={id}
                            dir="auto"
                            type={type}
                            classNames={{
                                input: classes.input,
                                section: classes.section
                            }}
                            leftSection={leftSection}
                            leftSectionPointerEvents={leftSection ? 'all' : 'none'}
                            onClick={copy}
                            readOnly
                            rightSection={
                                <ActionIcon
                                    aria-label={t(
                                        copied ? 'common.message.copied' : 'common.action.copy'
                                    )}
                                    className={classes.copyButton}
                                    color={copied ? 'teal' : 'gray'}
                                    onClick={copy}
                                    variant="subtle"
                                >
                                    {copied ? <PiCheck size="16px" /> : <PiCopy size="16px" />}
                                </ActionIcon>
                            }
                            rightSectionPointerEvents="all"
                            rightSectionWidth={44}
                            size={size}
                            value={value.toString()}
                        />
                    </div>
                </Input.Wrapper>
            )}
        </CopyButton>
    )
}

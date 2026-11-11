import { ActionIcon, Box, CopyButton, Text, Tooltip } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { PiCheck, PiCopy } from 'react-icons/pi'

import classes from './ErrorMessageBlock.module.css'

interface IProps {
    message: string
    copyValue?: string
    details?: string
    tone?: 'error' | 'warning' | 'upgrade'
}

export const ErrorMessageBlock = (props: IProps) => {
    const { message, copyValue = message, details, tone = 'error' } = props
    const { t } = useTranslation()

    return (
        <Box className={classes.message} data-tone={tone}>
            <Text className={classes.text}>{message}</Text>
            {details && (
                <Box component="details" mt="xs">
                    <Text component="summary" size="xs" style={{ cursor: 'pointer' }}>
                        {t('requestErrors.technicalDetails')}
                    </Text>
                    <Text className={classes.details} component="pre">
                        {details}
                    </Text>
                </Box>
            )}

            <CopyButton timeout={2000} value={copyValue}>
                {({ copied, copy }) => (
                    <Tooltip label={t('common.action.copy')}>
                        <ActionIcon
                            className={classes.copyButton}
                            color={copied ? 'teal' : 'gray'}
                            data-copied={copied}
                            onClick={copy}
                            size="sm"
                            variant="subtle"
                        >
                            {copied ? <PiCheck size={14} /> : <PiCopy size={14} />}
                        </ActionIcon>
                    </Tooltip>
                )}
            </CopyButton>
        </Box>
    )
}

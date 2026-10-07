import { Badge, CloseButton } from '@mantine/core'
import { useTranslation } from 'react-i18next'

import classes from './tag-input-pill.module.css'

interface IProps {
    onRemove?: () => void
    value: string | undefined
}

export function TagInputPill({ onRemove, value }: IProps) {
    const { t } = useTranslation()
    return (
        <Badge
            className={classes.pill}
            leftSection={
                onRemove ? (
                    <CloseButton
                        aria-label={`${t('common.action.delete')}: ${value ?? ''}`}
                        className={classes.remove}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                            event.stopPropagation()
                            onRemove()
                        }}
                        radius="sm"
                        size={24}
                        variant="transparent"
                    />
                ) : null
            }
            radius="sm"
            size="md"
            variant="soft"
        >
            <bdi>{value}</bdi>
        </Badge>
    )
}

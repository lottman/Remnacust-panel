import { ActionIcon, Menu } from '@mantine/core'
import { useDisclosure, useId } from '@mantine/hooks'
import { useTranslation } from 'react-i18next'
import { TbDots } from 'react-icons/tb'

import classes from './entity-card.module.css'

interface MenuActionProps {
    children: React.ReactNode
}

export function EntityCardMenuAction({ children }: MenuActionProps) {
    const { t } = useTranslation()
    const uuid = useId()
    const [opened, handlers] = useDisclosure()

    return (
        <Menu
            key={uuid}
            onClose={handlers.close}
            onOpen={handlers.open}
            position="bottom-end"
            radius="md"
            trigger="click"
            withinPortal
        >
            <Menu.Target>
                <ActionIcon
                    aria-label={t('common.action.more-actions')}
                    className={classes.menuControl}
                    color={opened ? 'cyan' : 'gray'}
                    onClick={(event) => event.stopPropagation()}
                    size="30"
                    variant={opened ? 'light' : 'subtle'}
                >
                    <TbDots size={18} />
                </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown onClick={(event) => event.stopPropagation()}>{children}</Menu.Dropdown>
        </Menu>
    )
}

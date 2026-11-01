import { Accordion, BoxProps, Text } from '@mantine/core'
import { ReactNode } from 'react'

import { HeadingIcon } from '@shared/ui/heading-icon'

import classes from './disclosure-card.module.css'

interface Props {
    children: ReactNode
    description?: string
    icon: ReactNode
    mb?: BoxProps['mb']
    onChange: (opened: boolean) => void
    opened: boolean
    title: string
}

export function DisclosureCard({
    children,
    description,
    icon,
    mb = 'md',
    onChange,
    opened,
    title
}: Props) {
    return (
        <Accordion
            classNames={classes}
            keepMounted
            keepMountedMode="display-none"
            mb={mb}
            onChange={(value) => onChange(value === 'content')}
            order={3}
            radius="md"
            value={opened ? 'content' : null}
            variant="contained"
        >
            <Accordion.Item value="content">
                <Accordion.Control icon={<HeadingIcon size={36}>{icon}</HeadingIcon>}>
                    <Text className={classes.title} fw={600} size="md">
                        {title}
                    </Text>
                    {description && (
                        <Text c="dimmed" className={classes.description} size="xs">
                            {description}
                        </Text>
                    )}
                </Accordion.Control>
                <Accordion.Panel>{children}</Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}

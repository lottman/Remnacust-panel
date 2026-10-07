import { Accordion, BoxProps, Text, ThemeIcon } from '@mantine/core'
import { ReactNode } from 'react'

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
            order={4}
            radius="md"
            value={opened ? 'content' : null}
            variant="contained"
        >
            <Accordion.Item value="content">
                <Accordion.Control
                    icon={
                        <ThemeIcon aria-hidden color="cyan" radius="md" size={36} variant="light">
                            {icon}
                        </ThemeIcon>
                    }
                >
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

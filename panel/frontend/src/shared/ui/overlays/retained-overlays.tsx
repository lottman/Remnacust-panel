import { Modal, Drawer, type ModalProps, type DrawerProps } from '@mantine/core'
import { useState, type ReactNode } from 'react'

export function ExitRetainedContent({
    opened,
    children
}: {
    opened: boolean
    children: ReactNode
}) {
    const [retained, setRetained] = useState(children)
    if (opened && retained !== children) setRetained(children)
    return <>{opened ? children : retained}</>
}

export function RetainedModal({ opened, title, children, ...props }: ModalProps) {
    return (
        <Modal
            {...props}
            opened={opened}
            title={<ExitRetainedContent opened={opened}>{title}</ExitRetainedContent>}
        >
            <ExitRetainedContent opened={opened}>{children}</ExitRetainedContent>
        </Modal>
    )
}

export function RetainedDrawer({ opened, title, children, ...props }: DrawerProps) {
    return (
        <Drawer
            {...props}
            opened={opened}
            title={<ExitRetainedContent opened={opened}>{title}</ExitRetainedContent>}
        >
            <ExitRetainedContent opened={opened}>{children}</ExitRetainedContent>
        </Drawer>
    )
}

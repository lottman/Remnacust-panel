import { Box, Group } from '@mantine/core'

import styles from './ModalFooter.module.css'

interface IProps {
    children: React.ReactNode
    isMobile?: boolean
}

export function ModalFooter(props: IProps) {
    const { children, isMobile = false } = props

    return (
        <Box className={styles.footer} component="footer" mt="md">
            <Group
                gap="md"
                grow={!!isMobile}
                justify="flex-end"
                preventGrowOverflow={false}
                w="100%"
                wrap="wrap"
            >
                {children}
            </Group>
        </Box>
    )
}

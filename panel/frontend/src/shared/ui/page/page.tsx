import { Box, BoxProps } from '@mantine/core'
import clsx from 'clsx'
import { forwardRef, ReactNode, useMemo } from 'react'
import { useLocation } from 'react-router'
import { app } from 'src/config'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { parseColoredTextUtil } from '@shared/utils/misc'

import classes from './page.module.css'

interface PageProps extends BoxProps {
    children: ReactNode
    meta?: ReactNode
    title: string
}
export const Page = forwardRef<HTMLDivElement, PageProps>(
    ({ children, title = '', meta, className, ...other }, ref) => {
        const { pathname } = useLocation()
        const { data: authStatus } = useGetAuthStatus()
        const titleParts = useMemo(
            () =>
                authStatus?.branding.title
                    ? parseColoredTextUtil(authStatus.branding.title)
                          .map((part) => part.text)
                          .join('')
                    : app.name,
            [authStatus]
        )
        return (
            <>
                <title>{`${title} | ${titleParts}`}</title>
                {meta}
                <Box
                    data-panel-page
                    key={pathname}
                    className={clsx(classes.page, className)}
                    ref={ref}
                    {...other}
                >
                    {children}
                </Box>
            </>
        )
    }
)

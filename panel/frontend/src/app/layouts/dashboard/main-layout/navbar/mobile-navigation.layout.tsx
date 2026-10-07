import { Box, NavLink, Stack, Title } from '@mantine/core'
import { PiArrowRight } from 'react-icons/pi'
import { NavLink as RouterLink, useLocation } from 'react-router'

import { useMobileMenuSections } from '../menu-sections/mobile-menu-sections'
import classes from './mobile-navigation.module.css'

interface IProps {
    onClose?: () => void
}

export const MobileNavigation = (props: IProps) => {
    const { onClose } = props
    const { pathname } = useLocation()
    const matches = (href: string) => pathname === href || pathname.startsWith(href + '/')

    const menu = useMobileMenuSections()

    return (
        <Stack gap="lg" pb="lg" pt="lg" component="nav">
            {menu.map((item) => (
                <Box key={item.id}>
                    <Title className={classes.sectionTitle} order={6}>
                        {item.header}
                    </Title>

                    <Stack gap={2}>
                        {item.section.map((subItem) =>
                            subItem.dropdownItems ? (
                                <NavLink
                                    active={subItem.dropdownItems.some((item) =>
                                        matches(item.href)
                                    )}
                                    defaultOpened={subItem.dropdownItems.some((item) =>
                                        matches(item.href)
                                    )}
                                    childrenOffset={0}
                                    className={classes.sectionLink}
                                    key={subItem.id}
                                    label={subItem.name}
                                    leftSection={subItem.icon && <subItem.icon />}
                                    variant="light"
                                >
                                    {subItem.dropdownItems?.map((dropdownItem) => (
                                        <NavLink
                                            active={matches(dropdownItem.href)}
                                            className={classes.sectionDropdownItemLink}
                                            component={RouterLink}
                                            key={dropdownItem.id}
                                            label={dropdownItem.name}
                                            leftSection={
                                                dropdownItem.icon ? (
                                                    <dropdownItem.icon />
                                                ) : (
                                                    <PiArrowRight />
                                                )
                                            }
                                            onClick={onClose}
                                            to={dropdownItem.href}
                                            variant="subtle"
                                        />
                                    ))}
                                </NavLink>
                            ) : (
                                <NavLink
                                    active={matches(subItem.href)}
                                    className={classes.sectionLink}
                                    component={RouterLink}
                                    key={subItem.id}
                                    label={subItem.name}
                                    leftSection={subItem.icon && <subItem.icon />}
                                    onClick={onClose}
                                    to={subItem.href}
                                    variant="subtle"
                                    {...(subItem.newTab
                                        ? { target: '_blank', rel: 'noopener noreferrer' }
                                        : {})}
                                />
                            )
                        )}
                    </Stack>
                </Box>
            ))}
        </Stack>
    )
}

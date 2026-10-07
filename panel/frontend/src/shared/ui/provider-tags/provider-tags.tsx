import { Avatar, Badge, Group, Tooltip } from '@mantine/core'
import clsx from 'clsx'
import { TbTag } from 'react-icons/tb'

import { faviconResolver } from '@shared/utils/misc/favicon-resolver'

import classes from './provider-tags.module.css'

type Provider = { name: string; faviconLink?: string | null }

export function ProviderTags({
    providers,
    tags,
    nodeLayout = false
}: {
    providers: Provider[]
    tags: string[]
    nodeLayout?: boolean
}) {
    const uniqueProviders = [...new Map(providers.map((p) => [p.name, p])).values()]
    const uniqueTags = [...new Set(tags)].sort((a, b) => a.localeCompare(b))
    if (!uniqueProviders.length && !uniqueTags.length) return null
    const groups = [
        uniqueProviders.map((p) => ({ name: p.name, provider: p, key: 'provider:' + p.name })),
        uniqueTags.map((name) => ({ name, provider: null, key: 'tag:' + name }))
    ].filter((items) => items.length > 0)
    return (
        <Group
            className={clsx(
                classes.group,
                nodeLayout &&
                    uniqueProviders.length > 0 &&
                    uniqueTags.length > 0 &&
                    classes.nodeLayout
            )}
            gap={4}
            wrap="wrap"
        >
            {groups.map((items) => {
                const visible = items.slice(0, items[0].provider ? 1 : nodeLayout ? 5 : 2)
                const hidden = items.slice(visible.length)
                return (
                    <Group
                        key={items[0].provider ? 'providers' : 'tags'}
                        className={clsx(
                            classes.row,
                            nodeLayout && !items[0].provider && classes.nodeTags
                        )}
                        gap={4}
                        wrap="nowrap"
                    >
                        {visible.map(({ name, provider, key }) => (
                            <Tooltip
                                key={key}
                                label={name}
                                events={{ hover: true, focus: true, touch: true }}
                            >
                                <Badge
                                    className={classes.badge}
                                    radius={nodeLayout ? (provider ? 'xl' : 'md') : undefined}
                                    tabIndex={0}
                                    color={provider ? 'gray' : undefined}
                                    variant="light"
                                    size={nodeLayout ? 'md' : 'sm'}
                                    leftSection={
                                        provider ? (
                                            <Avatar
                                                size={nodeLayout ? 16 : 14}
                                                radius="sm"
                                                name={name}
                                                src={faviconResolver(provider.faviconLink ?? null)}
                                                imageProps={{ decoding: 'async', loading: 'lazy' }}
                                            />
                                        ) : (
                                            <TbTag size={nodeLayout ? 14 : 12} />
                                        )
                                    }
                                >
                                    {name}
                                </Badge>
                            </Tooltip>
                        ))}
                        {hidden.length > 0 && (
                            <Tooltip
                                label={hidden.map((item) => item.name).join(' · ')}
                                multiline
                                maw={320}
                                events={{ hover: true, focus: true, touch: true }}
                            >
                                <Badge
                                    className={classes.overflow}
                                    radius={nodeLayout ? 'md' : undefined}
                                    tabIndex={0}
                                    size={nodeLayout ? 'md' : 'sm'}
                                    variant="light"
                                    color="gray"
                                >
                                    <bdi dir="ltr">+{hidden.length}</bdi>
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>
                )
            })}
        </Group>
    )
}

import { Spotlight, SpotlightProps } from '@mantine/spotlight'
import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TbSearch } from 'react-icons/tb'

import { EmptyPageLayout } from '../layouts/empty-page'
import classes from './spotlight.module.css'

interface IProps {
    actions: SpotlightProps['actions']
    searchIcon?: ReactNode
}

export const UniversalSpotlightContentShared = (props: IProps) => {
    const { actions, searchIcon } = props
    const { t } = useTranslation()

    return (
        <Spotlight
            actions={actions}
            classNames={classes}
            centered
            highlightQuery
            maxHeight="min(540px, calc(100dvh - 160px))"
            size="min(680px, calc(100vw - 24px))"
            nothingFound={<EmptyPageLayout icon={<TbSearch size="32px" />} />}
            overlayProps={{ backgroundOpacity: 0.6, blur: 0 }}
            scrollable
            searchProps={{
                'aria-label': t('common.action.search'),
                style: { '--input-height': '60px' },
                leftSectionWidth: 54,
                leftSectionPointerEvents: 'none',
                leftSection: searchIcon ?? (
                    <TbSearch color="var(--mantine-color-gray-5)" size={18} />
                ),
                placeholder: `${t('common.action.search')}...`
            }}
            shortcut={['mod + F']}
        />
    )
}

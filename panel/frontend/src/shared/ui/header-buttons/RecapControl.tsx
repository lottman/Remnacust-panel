import { rem } from '@mantine/core'
import { modals } from '@mantine/modals'
import { RecapContent } from '@widgets/dashboard/recap/recap.content.widget'
import { TbSparkles } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'

import { BaseOverlayHeader } from '../overlays/base-overlay-header'
import { HeaderControl } from './HeaderControl'

export function RecapControl({ label }: { label?: string } = {}) {
    const uiText = useUiText()

    const handleClick = () => {
        modals.open({
            title: (
                <BaseOverlayHeader
                    iconColor="indigo"
                    IconComponent={TbSparkles}
                    iconVariant="soft"
                    title={uiText('recap-31056c3')}
                />
            ),
            centered: true,
            size: '980px',
            withCloseButton: true,
            children: <RecapContent />
        })
    }

    return (
        <HeaderControl
            aria-label={label ?? uiText('recap-31056c3')}
            label={label}
            onClick={handleClick}
        >
            <TbSparkles style={{ width: rem(22), height: rem(22) }} />
        </HeaderControl>
    )
}

import { Badge } from '@mantine/core'
import { TbInfinity } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'

export function AlwaysAvailableHostBadge({ enabled }: { enabled?: boolean }) {
    const uiText = useUiText()

    if (!enabled) return null

    return (
        <Badge
            color="cyan"
            data-host-always-available="true"
            leftSection={<TbInfinity aria-hidden size={13} />}
            size="sm"
            styles={{
                root: {
                    flexShrink: 0,
                    height: 'auto',
                    maxWidth: '100%',
                    padding: '3px 8px',
                    width: 'fit-content'
                },
                label: { lineHeight: 1.4, textTransform: 'none', whiteSpace: 'normal' }
            }}
            title={uiText('access-after-subscription-expiry-is-enabled-52c699c')}
            variant="light"
        >
            {uiText('after-subscription-expiry-66a7704')}
        </Badge>
    )
}

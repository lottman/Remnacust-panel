import { Center } from '@mantine/core'
import { TbBrowserX } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { EmptyPageLayout } from '@shared/ui/layouts/empty-page'

export const InstanceConflictScreen = () => {
    const uiText = useUiText()
    return (
        <Center flex={1} p="md">
            <EmptyPageLayout
                icon={<TbBrowserX size={32} />}
                title={uiText('already-open-in-another-tab-fa90add')}
            />
        </Center>
    )
}

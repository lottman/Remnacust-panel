import { ActionIcon, Group } from '@mantine/core'
import { PiArrowsClockwise, PiSignOutDuotone } from 'react-icons/pi'
import { useNavigate } from 'react-router'

import { clearQueryClient } from '@shared/api'
import { resetAllStores } from '@shared/hocs/store-wrapper'
import { useLogout } from '@shared/hooks/use-logout'
import { LanguagePicker } from '@shared/ui/language-picker/language-picker.shared'


export const HeaderButtons = () => {
    const { logout, pending } = useLogout()
    const navigate = useNavigate()

    const handleRefresh = () => {
        resetAllStores()
        clearQueryClient()
        navigate(0)
    }

    return (
        <Group grow preventGrowOverflow={false} wrap="wrap">
            <LanguagePicker />

            <ActionIcon color="gray" onClick={handleRefresh} size="xl">
                <PiArrowsClockwise size="24px" />
            </ActionIcon>

            <ActionIcon color="cyan" loading={pending} onClick={logout} size="xl">
                <PiSignOutDuotone size="24px" />
            </ActionIcon>
        </Group>
    )
}

import { USERS_STATUS } from '@remnawave/backend-contract'

import { translateUiText as uiText } from '@shared/i18n/interface-text'

export const userStatusValues = [
    {
        value: USERS_STATUS.ACTIVE,
        get label() {
            return uiText('active-9234069')
        }
    },
    {
        value: USERS_STATUS.LIMITED,
        get label() {
            return uiText('limited-e5125d9')
        }
    },
    {
        value: USERS_STATUS.DISABLED,
        get label() {
            return uiText('disabled-75081b5')
        }
    },
    {
        value: USERS_STATUS.EXPIRED,
        get label() {
            return uiText('expired-424a255')
        }
    }
]

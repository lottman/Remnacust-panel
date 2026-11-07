import { useEffect, useRef } from 'react'

import { useXrayMode } from '@shared/api/hooks/xray-mode'
import { flushEditorRecoveries } from '@shared/utils/editor-recovery-flush'

export function XrayModeSync() {
    const { data } = useXrayMode()
    const previous = useRef(data?.mode)
    useEffect(() => {
        if (!data) return
        if (
            previous.current &&
            previous.current !== data.mode &&
            (typeof window.XrayParseConfig === 'function' ||
                /\/dashboard\/(?:templates|management\/config-profiles)\//.test(location.pathname))
        ) {
            void flushEditorRecoveries()
                .then(() => location.reload())
                .catch(() => {})
        }
        previous.current = data.mode
    }, [data])
    return null
}

import { useEffect, useReducer } from 'react'

import {
    comparable,
    createRemarksDraft,
    isRemarksDirty,
    remarksDraftReducer,
    type CustomRemarks
} from './remarks-editor.utils'

export function useRemarksDraft(value: CustomRemarks | null, inherited?: CustomRemarks) {
    const [state, dispatch] = useReducer(remarksDraftReducer, { value, inherited }, (initial) =>
        createRemarksDraft(initial.value, initial.inherited)
    )
    const signature = comparable(value)
    const inheritedSignature = comparable(inherited)
    useEffect(() => {
        dispatch({ type: 'sync', value, inherited })
    }, [signature, inheritedSignature])
    const dirty = isRemarksDirty(state)
    useEffect(() => {
        if (!dirty) return
        const preventUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', preventUnload)
        return () => window.removeEventListener('beforeunload', preventUnload)
    }, [dirty])
    return { state, dispatch, dirty }
}

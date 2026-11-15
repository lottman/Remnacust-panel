import { useLayoutEffect } from 'react'

import { useForm as actualUseForm } from '../../../node_modules/@mantine/form/esm/index.mjs'

export * from '../../../node_modules/@mantine/form/esm/index.mjs'
export const observedForms = new Map<string, unknown>()
export const useForm: typeof import('@mantine/form').useForm = (options) => {
    const form = actualUseForm(options)
    useLayoutEffect(() => {
        observedForms.set(options?.name ?? 'editor', form)
        return () => {
            if (observedForms.get(options?.name ?? 'editor') === form)
                observedForms.delete(options?.name ?? 'editor')
        }
    })
    return form
}

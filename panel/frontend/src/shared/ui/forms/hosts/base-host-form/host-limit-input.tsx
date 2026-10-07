import { NumberInput, NumberInputProps } from '@mantine/core'
import { useState } from 'react'

import { useHostFormData } from './options/host-form-data.context'

type Field =
    | 'userTrafficLimitBytes'
    | 'serverSpeedLimitMbps'
    | 'totalSpeedLimitMbps'
    | 'trafficMultiplier'
    | 'trafficLimitResetValue'

export function HostLimitInput({
    field,
    scale = 1,
    emptyValue = 0,
    ...props
}: Omit<NumberInputProps, 'value' | 'defaultValue' | 'onChange'> & {
    field: Field
    scale?: number
    emptyValue?: number
}) {
    const { form } = useHostFormData()
    const display = (value: unknown) =>
        value == null || value === '' ? emptyValue : Number(value) / scale
    const [draft, setDraft] = useState<number | string>(() => display(form.getValues()[field]))
    const input = form.getInputProps(field)
    form.watch(field, ({ value }) => setDraft(display(value)))

    return (
        <NumberInput
            hideControls
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            styles={{ description: { marginTop: 6 }, label: { marginBottom: 4 } }}
            {...props}
            name={field}
            error={input.error}
            value={draft}
            onChange={(value) => {
                const numeric = value === '' ? emptyValue : Number(value)
                input.onChange(scale === 1 ? numeric : Math.round(numeric * scale))
                setDraft(value)
            }}
            onBlur={(event) => {
                if (draft === '') {
                    input.onChange(emptyValue * scale)
                    setDraft(emptyValue)
                }
                input.onBlur?.(event)
            }}
        />
    )
}

import { FormErrors } from '@mantine/form'
import {
    NodeControlAddressesSchema,
    normalizeNodeControlAddress
} from '@remnawave/backend-contract'
import { t } from 'i18next'

import {
    MAX_NODE_CONTROL_ADDRESSES,
    NodeControlAddress
} from '@shared/utils/node-control-addresses'

export function getNodeControlAddressesErrors(
    addresses: NodeControlAddress[] | undefined,
    { required = false }: { required?: boolean } = {}
): FormErrors {
    if (required && !addresses?.length) {
        return { controlAddresses: t('node-control-addresses.required') }
    }
    if (addresses === undefined) return {}
    const parsed = NodeControlAddressesSchema.safeParse(addresses)
    if (parsed.success) return {}

    const errors: FormErrors = {}
    for (const issue of parsed.error.issues) {
        const index = issue.path[0]
        if (typeof index === 'number') {
            errors[`controlAddresses.${index}.address`] =
                addresses[index]?.address.trim() === ''
                    ? t('node-control-addresses.required')
                    : t('node-control-addresses.invalid')
        } else {
            errors.controlAddresses = t('node-control-addresses.invalid-list', {
                max: MAX_NODE_CONTROL_ADDRESSES
            })
        }
    }
    const seen = new Set<string>()
    addresses.forEach((entry, index) => {
        const normalized = normalizeNodeControlAddress(entry.address)
        if (normalized === null) return
        if (seen.has(normalized)) {
            errors[`controlAddresses.${index}.address`] = t('node-control-addresses.duplicate')
        }
        seen.add(normalized)
    })
    return errors
}

export const withNodeControlAddressesErrors =
    <T extends { controlAddresses?: NodeControlAddress[] }>(
        resolver: (values: T) => FormErrors | Promise<FormErrors>,
        options?: { required?: boolean }
    ) =>
    (values: T): FormErrors | Promise<FormErrors> => {
        const merge = (errors: FormErrors): FormErrors => ({
            ...errors,
            ...getNodeControlAddressesErrors(values.controlAddresses, options)
        })
        const resolved = resolver(values)
        return resolved instanceof Promise ? resolved.then(merge) : merge(resolved)
    }

import { FormErrors, schemaResolver, UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand } from '@remnawave/backend-contract'
import { t } from 'i18next'

import { getNodeControlAddressesErrors } from '@shared/ui/node-ips/validate-node-control-addresses'

const resolve = schemaResolver(CreateNodeCommand.RequestBodySchema, { sync: true })
export const CREATE_NODE_ADDITIONAL_FIELDS = [
    'proxyUrl',
    'providerUuid',
    'activePluginUuid',
    'tags'
]
const fieldOrder = [
    'name',
    'countryCode',
    'controlAddresses',
    'port',
    'proxyUrl',
    'providerUuid',
    'activePluginUuid',
    'tags',
    'configProfile'
]

export interface CreateNodeFocusRequest {
    field: string
    requestId: number
}

export function focusCreateNodeError(
    form: UseFormReturnType<CreateNodeCommand.RequestBody>,
    field: string
) {
    if (CREATE_NODE_ADDITIONAL_FIELDS.includes(field.split('.')[0])) {
        document
            .querySelector<HTMLElement>('[data-create-node-additional-options]')
            ?.scrollIntoView({ block: 'nearest' })
    }
    const path = field.startsWith('configProfile')
        ? 'configProfile'
        : field === 'controlAddresses'
          ? 'controlAddresses.0.address'
          : field
    const input = form.getInputNode(path) ?? form.getInputNode(field.split('.')[0])
    input?.focus()
}

export function getCreateNodeErrors(values: CreateNodeCommand.RequestBody): FormErrors {
    const errors = {
        ...resolve(values),
        ...getNodeControlAddressesErrors(values.controlAddresses, { required: true })
    }
    if (errors.proxyUrl) errors.proxyUrl = t('node-control-addresses.proxy-invalid')
    return errors
}

export function getCreateNodeErrorStep(field: string): 0 | 1 {
    return field === 'configProfile' || field.startsWith('configProfile.') ? 1 : 0
}

export function getCreateNodeStepErrors(errors: FormErrors, step: 0 | 1): FormErrors {
    const order = (field: string) => {
        const index = fieldOrder.indexOf(field.split('.')[0])
        return index < 0 ? fieldOrder.length : index
    }
    return Object.fromEntries(
        Object.entries(errors)
            .filter(([field]) => getCreateNodeErrorStep(field) === step)
            .sort(
                ([left], [right]) =>
                    order(left) - order(right) ||
                    (left === 'controlAddresses' && right.startsWith('controlAddresses.')
                        ? 1
                        : right === 'controlAddresses' && left.startsWith('controlAddresses.')
                          ? -1
                          : left.localeCompare(right, 'en', { numeric: true }))
            )
    )
}

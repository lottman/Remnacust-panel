import { useForm, schemaResolver } from '@mantine/form'
import { UpdateHostCommand } from '@remnawave/backend-contract'
import { useEffect } from 'react'

import { queryClient } from '@shared/api'
import {
    QueryKeys,
    useGetConfigProfiles,
    useGetHostTags,
    useGetInternalSquads,
    useGetNodes,
    useGetSubscriptionTemplates,
    useUpdateHost
} from '@shared/api/hooks'
import { BaseHostForm } from '@shared/ui/forms/hosts/base-host-form'
import { validateHostDomainRules } from '@shared/ui/forms/hosts/base-host-form/domain-presets'
import { HostFormLoading } from '@shared/ui/forms/hosts/base-host-form/host-form-loading'
import { validateHostInbound } from '@shared/ui/forms/hosts/base-host-form/validate-host-inbound'
import { parseJsonField, stringifyJsonField } from '@shared/utils/misc'

interface IProps {
    host: UpdateHostCommand.Response['response']
    onClose: () => void
}

export const EditHostDrawerContent = (props: IProps) => {
    const { host, onClose } = props

    const configProfilesQuery = useGetConfigProfiles()
    const { data: configProfiles } = configProfilesQuery
    const nodesQuery = useGetNodes()
    const { data: nodes } = nodesQuery
    const templatesQuery = useGetSubscriptionTemplates()
    const { data: templates } = templatesQuery
    const internalSquadsQuery = useGetInternalSquads()
    const { data: internalSquads } = internalSquadsQuery
    const hostTagsQuery = useGetHostTags()
    const { data: hostTags } = hostTagsQuery

    const form = useForm<UpdateHostCommand.RequestBody>({
        name: 'edit-host-form',
        mode: 'uncontrolled',
        validateInputOnBlur: true,
        onValuesChange: (values) => {
            if (typeof values.vlessRouteId === 'string' && values.vlessRouteId === '') {
                form.setFieldValue('vlessRouteId', null)
            }
        },
        validate: (values) => ({
            ...schemaResolver(UpdateHostCommand.RequestBodySchema.omit({ uuid: true }), {
                sync: true
            })(values),
            ...validateHostInbound(values.inbound, configProfiles?.configProfiles),
            ...validateHostDomainRules(values)
        })
    })

    const { mutate: updateHost, isPending: isUpdateHostPending } = useUpdateHost({
        mutationFns: {
            onSuccess: (data) => {
                queryClient.setQueryData(
                    QueryKeys.hosts.getHost({ uuid: host.uuid }).queryKey,
                    data
                )
                onClose()
            }
        }
    })

    useEffect(() => {
        if (configProfiles) {
            form.initialize({
                uuid: host.uuid,
                remark: host.remark,
                address: host.address,
                port: host.port,
                securityLayer: host.securityLayer,
                isDisabled: host.isDisabled,
                alwaysAvailable: host.alwaysAvailable ?? false,
                onlyWhenInactive: host.onlyWhenInactive ?? false,
                userTrafficLimitBytes: host.userTrafficLimitBytes ?? 0,
                speedLimitMbps: host.speedLimitMbps ?? 0,
                serverSpeedLimitMbps: host.serverSpeedLimitMbps ?? 0,
                totalSpeedLimitMbps: host.totalSpeedLimitMbps ?? 0,
                trafficMultiplier: host.trafficMultiplier ?? null,
                useTagTrafficLimit: host.useTagTrafficLimit ?? true,
                useTagSpeedLimit: host.useTagSpeedLimit ?? true,
                useTagTotalSpeedLimit: host.useTagTotalSpeedLimit ?? true,
                domainRules: host.domainRules ?? null,
                sniRegeneration: host.sniRegeneration ?? null,
                trafficLimitResetValue: host.trafficLimitResetValue ?? 0,
                trafficLimitResetUnit: host.trafficLimitResetUnit ?? 'DAYS',
                sni: host.sni ?? undefined,
                host: host.host ?? undefined,
                path: host.path ?? undefined,
                alpn: host.alpn ?? undefined,
                fingerprint: host.fingerprint ?? undefined,
                inbound:
                    host.inbound.configProfileUuid && host.inbound.configProfileInboundUuid
                        ? {
                              configProfileUuid: host.inbound.configProfileUuid,
                              configProfileInboundUuid: host.inbound.configProfileInboundUuid
                          }
                        : undefined,
                serverDescription: host.serverDescription ?? undefined,
                xhttpExtraParams: stringifyJsonField(host.xhttpExtraParams),
                muxParams: stringifyJsonField(host.muxParams),
                sockoptParams: stringifyJsonField(host.sockoptParams),
                finalMask: stringifyJsonField(host.finalMask),
                mapper: host.mapper,
                tags: host.tags ?? undefined,
                isHidden: host.isHidden,
                overrideSniFromAddress: host.overrideSniFromAddress,
                keepSniBlank: host.keepSniBlank,
                vlessRouteId: host.vlessRouteId ?? undefined,
                pinnedPeerCertSha256: host.pinnedPeerCertSha256 ?? undefined,
                verifyPeerCertByName: host.verifyPeerCertByName ?? undefined,
                shuffleHost: host.shuffleHost ?? undefined,
                mihomoX25519: host.mihomoX25519 ?? undefined,
                mihomoIpVersion: host.mihomoIpVersion ?? undefined,
                nodes: host.nodes ?? undefined,
                xrayJsonTemplateUuid: host.xrayJsonTemplateUuid ?? undefined,
                internalSquads: host.internalSquads ?? undefined,
                excludeFromSubscriptionTypes: host.excludeFromSubscriptionTypes ?? undefined
            })
        }
    }, [configProfiles, host])

    const handleSubmit = form.onSubmit(async (values) => {
        updateHost({
            variables: {
                ...values,
                uuid: host.uuid,
                xhttpExtraParams: parseJsonField(values.xhttpExtraParams),
                muxParams: parseJsonField(values.muxParams),
                sockoptParams: parseJsonField(values.sockoptParams),
                finalMask: parseJsonField(values.finalMask)
            }
        })
    })

    if (!configProfiles || !nodes || !templates || !internalSquads || !hostTags) {
        return (
            <HostFormLoading
                queries={[
                    configProfilesQuery,
                    nodesQuery,
                    templatesQuery,
                    internalSquadsQuery,
                    hostTagsQuery
                ]}
            />
        )
    }

    return (
        <BaseHostForm
            configProfiles={configProfiles.configProfiles}
            form={form}
            handleSubmit={handleSubmit}
            hostTags={hostTags.tags}
            internalSquads={internalSquads.internalSquads}
            isSubmitting={isUpdateHostPending}
            nodes={nodes}
            hostUuid={host.uuid}
            subscriptionTemplates={templates.templates}
        />
    )
}

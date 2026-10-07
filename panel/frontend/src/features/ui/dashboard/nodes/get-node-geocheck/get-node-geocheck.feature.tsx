import { ActionIcon, Tooltip } from '@mantine/core'
import { GetNodeCommand } from '@remnawave/backend-contract'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TbMapSearch } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'

import {
    MIN_REMNACUST_NODE_VERSION,
    MIN_REMNAWAVE_NODE_VERSION,
    supportsNodeGeocheck
} from './node-geocheck-support'

interface IProps {
    node: GetNodeCommand.Response['response']
}

const GetNodeGeocheckFeatureComponent = (props: IProps) => {
    const { node } = props
    const { t } = useTranslation()

    const nodeVersion = node.versions?.node

    const isSupported = useMemo(() => supportsNodeGeocheck(nodeVersion), [nodeVersion])

    return (
        <Tooltip
            label={
                isSupported
                    ? t('node-geocheck.title')
                    : t('node-geocheck.requires-node-version', {
                          remnacustVersion: MIN_REMNACUST_NODE_VERSION,
                          version: MIN_REMNAWAVE_NODE_VERSION
                      })
            }
        >
            <ActionIcon
                aria-label={t('node-geocheck.title')}
                disabled={!isSupported}
                color="indigo"
                onClick={() => {
                    showModal('nodes_nodeGeocheckModal', { node })
                }}
                size="lg"
                variant="soft"
            >
                <TbMapSearch size="22px" />
            </ActionIcon>
        </Tooltip>
    )
}

export const GetNodeGeocheckFeature = memo(GetNodeGeocheckFeatureComponent)

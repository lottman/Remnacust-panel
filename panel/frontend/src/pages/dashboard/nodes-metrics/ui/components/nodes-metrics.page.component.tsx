import { NodeMetricsWidget } from '@widgets/dashboard/nodes/nodes-metrics'
import { useTranslation } from 'react-i18next'
import { PiSpeedometer } from 'react-icons/pi'

import { useUiText } from '@shared/i18n/interface-text'
import { LoadingScreen, Page, PageHeaderShared } from '@shared/ui'

import { IProps } from './interfaces'

export default function NodesMetricsPageComponent(props: IProps) {
    const uiText = useUiText()

    const { t } = useTranslation()
    const { isLoading } = props

    return (
        <Page title={t('constants.nodes-metrics')}>
            <PageHeaderShared
                icon={<PiSpeedometer size={24} />}
                title={uiText('metrics-overview-3e78a3c')}
            />

            {isLoading ? <LoadingScreen height="80vh" /> : <NodeMetricsWidget />}
        </Page>
    )
}

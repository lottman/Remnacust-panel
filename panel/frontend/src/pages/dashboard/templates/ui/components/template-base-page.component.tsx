import { TemplatesHeaderActionButtonsFeature } from '@features/ui/dashboard/templates/header-action-buttons'
import {
    GetSubscriptionTemplatesCommand,
    TSubscriptionTemplateType
} from '@remnawave/backend-contract'
import { TemplatesGridWidget } from '@widgets/dashboard/templates/templates-grid/templates-grid.widget'
import { TemplatesSpotlightWidget } from '@widgets/dashboard/templates/templates-spotlight'

import { Page, PageHeaderShared } from '@shared/ui'
import { getCoreLogoFromType } from '@shared/ui/get-core-logo-from-type'

interface Props {
    templates: GetSubscriptionTemplatesCommand.Response['response']['templates']
    title: string
    type: TSubscriptionTemplateType
}

export const TemplateBasePageComponent = (props: Props) => {
    const { templates, title, type } = props

    return (
        <Page title={title}>
            <PageHeaderShared
                actions={<TemplatesHeaderActionButtonsFeature templateType={type} />}
                icon={getCoreLogoFromType({ type })}
                title={title}
            />

            <div>
                <TemplatesGridWidget templates={templates} type={type} />
            </div>

            <TemplatesSpotlightWidget templates={templates} />
        </Page>
    )
}

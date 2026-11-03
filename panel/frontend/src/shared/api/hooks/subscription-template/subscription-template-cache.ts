import type {
    GetSubscriptionTemplatesCommand,
    CreateSubscriptionTemplateCommand
} from '@remnawave/backend-contract'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

export async function cacheCreatedTemplate(
    client: QueryClient,
    key: QueryKey,
    template: CreateSubscriptionTemplateCommand.Response['response']
) {
    await client.cancelQueries({ queryKey: key, exact: true })
    client.setQueryData<GetSubscriptionTemplatesCommand.Response['response']>(key, (previous) => {
        if (!previous) return previous
        const templates = previous.templates.some((item) => item.uuid === template.uuid)
            ? previous.templates.map((item) => (item.uuid === template.uuid ? template : item))
            : [...previous.templates, template]
        return {
            ...previous,
            total: templates.length,
            templates: templates.toSorted((a, b) => a.viewPosition - b.viewPosition)
        }
    })
    await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' })
}

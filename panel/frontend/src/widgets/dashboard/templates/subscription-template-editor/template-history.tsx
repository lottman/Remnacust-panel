import { GetSubscriptionTemplateRevisionsCommand } from '@remnawave/backend-contract'
import { decode } from '@stablelib/base64'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { instance } from '@shared/api'
import { RevisionHistory } from '@shared/ui/revision-history/revision-history'

type Props = {
    uuid: string
    language: 'json' | 'yaml'
    draft: string
    baseline: string
    onRestore: (code: string) => void
}
export const templateHistoryKey = (uuid: string) => ['subscription-template-revisions', uuid]
export function TemplateHistory({ uuid, language, draft, baseline, onRestore }: Props) {
    const { t } = useTranslation()
    const query = useQuery({
        queryKey: templateHistoryKey(uuid),
        queryFn: async ({ signal }) =>
            GetSubscriptionTemplateRevisionsCommand.ResponseSchema.parse(
                (await instance.get(GetSubscriptionTemplateRevisionsCommand.url(uuid), { signal }))
                    .data
            ).response,
        staleTime: 15_000
    })
    return (
        <RevisionHistory
            key={uuid}
            language={language}
            draft={draft}
            baseline={baseline}
            help={t('template-history.help')}
            isPending={query.isPending}
            isError={query.isError}
            isFetching={query.isFetching}
            onRefresh={() => void query.refetch()}
            revisions={(query.data ?? []).map((revision) => ({
                uuid: revision.uuid,
                name: revision.name,
                createdAt: revision.createdAt,
                code:
                    revision.draftContent ??
                    (language === 'json'
                        ? JSON.stringify(revision.templateJson, null, 2)
                        : revision.encodedTemplateYaml
                          ? new TextDecoder().decode(decode(revision.encodedTemplateYaml))
                          : '')
            }))}
            onRestore={(revision) => onRestore(revision.code)}
        />
    )
}

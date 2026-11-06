import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { instance } from '@shared/api'
import type { useEditorRecovery } from '@shared/hooks/use-editor-recovery'
import { useUiText } from '@shared/i18n/interface-text'
import { EditorRecoveryHistory } from '@shared/ui/revision-history/editor-recovery-history'
import { RevisionHistory } from '@shared/ui/revision-history/revision-history'

const revisionSchema = z.object({
    response: z.array(
        z.object({
            uuid: z.uuid(),
            name: z.string(),
            config: z.unknown(),
            createdAt: z.iso.datetime()
        })
    )
})

interface Props {
    profileUuid: string
    draft: string
    baseline: string
    onRestore: (revision: { uuid: string; config: unknown }) => void
    recovery: ReturnType<typeof useEditorRecovery>
    onRecover: (code: string) => void
}
export function ProfileHistory({
    profileUuid,
    draft,
    baseline,
    onRestore,
    recovery,
    onRecover
}: Props) {
    const uiText = useUiText()
    const query = useQuery({
        queryKey: ['config-profile-revisions', profileUuid],
        queryFn: async ({ signal }) => {
            const result = await instance.get(
                `/api/config-profiles/${encodeURIComponent(profileUuid)}/revisions`,
                { signal }
            )
            return revisionSchema.parse(result.data).response
        },
        staleTime: 15_000
    })
    return (
        <EditorRecoveryHistory
            recovery={recovery}
            baseline={baseline}
            currentDraft={draft}
            language="json"
            onRestore={onRecover}
        >
            <RevisionHistory
                key={profileUuid}
                language="json"
                draft={draft}
                baseline={baseline}
                help={uiText(
                    'the-30-latest-versions-are-retained-restore-opens-an-unsaved-d-275da0f'
                )}
                isPending={query.isPending}
                isError={query.isError}
                isFetching={query.isFetching}
                onRefresh={() => void query.refetch()}
                revisions={(query.data ?? []).map((revision) => ({
                    ...revision,
                    code: JSON.stringify(revision.config, null, 2) ?? ''
                }))}
                onRestore={(revision) =>
                    onRestore({ uuid: revision.uuid, config: JSON.parse(revision.code) })
                }
            />
        </EditorRecoveryHistory>
    )
}

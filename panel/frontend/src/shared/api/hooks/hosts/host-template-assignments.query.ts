import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

import { instance } from '@shared/api/axios'

export const hostTemplateAssignmentsSchema = z.object({
    source: z.enum(['HOST', 'HOST_ASSIGNMENT', 'TAG_ASSIGNMENT', 'DEFAULT']),
    templates: z
        .array(z.object({ uuid: z.uuid(), name: z.string(), balancerTag: z.string().nullable() }))
        .max(10000)
})

export function useHostTemplateAssignments(uuid: string) {
    return useQuery({
        queryKey: ['host-template-assignments', uuid],
        queryFn: async ({ signal }) => {
            const { data } = await instance.get(
                `/api/hosts/panel-template-assignments/${encodeURIComponent(uuid)}`,
                { signal }
            )
            return hostTemplateAssignmentsSchema.parse(data.response)
        },
        retry: false,
        staleTime: 0,
        refetchOnMount: 'always'
    })
}

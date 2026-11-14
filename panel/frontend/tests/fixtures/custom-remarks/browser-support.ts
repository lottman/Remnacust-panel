import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let query = { status: 'ready', revision: 0 }
export function setSquadStatus(status: string) {
    query = { status, revision: query.revision + 1 }
    listeners.forEach((listener) => listener())
}
function useSquadQuery(kind: 'internal' | 'external') {
    const snapshot = useSyncExternalStore(
        (listener) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        () => query
    )
    return {
        data: {
            internalSquads:
                kind === 'internal' && snapshot.status === 'ready'
                    ? [
                          {
                              uuid: '10000000-0000-4000-8000-000000000002',
                              name: 'Example internal squad'
                          }
                      ]
                    : [],
            externalSquads:
                kind === 'external' && snapshot.status === 'ready'
                    ? [
                          {
                              uuid: '10000000-0000-4000-8000-000000000003',
                              name: 'Example external squad'
                          }
                      ]
                    : []
        },
        isPending: snapshot.status === 'loading',
        isError: snapshot.status === 'error',
        refetch: async () => {
            setSquadStatus('ready')
        }
    }
}
export const useGetInternalSquads = () => useSquadQuery('internal')
export const useGetExternalSquads = () => useSquadQuery('external')
export const useIsMobile = () => window.innerWidth < 768
export const usePanelReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

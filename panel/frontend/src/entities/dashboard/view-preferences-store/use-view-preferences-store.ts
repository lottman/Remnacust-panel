import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import {
    DEFAULT_QUICK_LINKS,
    sanitizeLauncherColumns,
    sanitizeLauncherPosition,
    sanitizeQuickLinks
} from '@shared/ui/quick-launcher/quick-links.types'

import { HOSTS_VIEW_MODE, IActions, IState, NODES_VIEW_MODE } from './interfaces'

const initialState: IState = {
    launcherEnabled: false,
    launcherPosition: null,
    launcherColumns: null,
    quickLinks: DEFAULT_QUICK_LINKS,
    nodesViewMode: NODES_VIEW_MODE.CARDS,
    nodesCardColumns: 1,
    nodesActiveTag: null,
    hostsViewMode: HOSTS_VIEW_MODE.CARDS,
    hostsCardColumns: 1,
    hostsActiveTag: null,
    sectionActiveTags: {}
}

// Retain link/position preferences, but do not enable a stable launcher from old experiments.
const migrateState = (persistedState: unknown): IState => ({
    ...initialState,
    ...(persistedState && typeof persistedState === 'object' ? persistedState : {}),
    launcherEnabled: false
})

export const useViewPreferencesStore = create<IActions & IState>()(
    persist(
        devtools(
            (set) => ({
                ...initialState,
                actions: {
                    setNodesViewMode: (mode) => set({ nodesViewMode: mode }),
                    setNodesCardColumns: (columns) => set({ nodesCardColumns: columns }),
                    setSectionActiveTag: (section, tag) =>
                        set((state) => ({
                            sectionActiveTags: { ...state.sectionActiveTags, [section]: tag }
                        })),
                    setNodesActiveTag: (tag) => set({ nodesActiveTag: tag }),
                    setHostsViewMode: (mode) => set({ hostsViewMode: mode }),
                    setHostsCardColumns: (columns) => set({ hostsCardColumns: columns }),
                    setHostsActiveTag: (tag) => set({ hostsActiveTag: tag }),
                    setLauncherPosition: (position) => set({ launcherPosition: position }),
                    setLauncherColumns: (columns) => set({ launcherColumns: columns }),
                    setQuickLinks: (links) => set({ quickLinks: sanitizeQuickLinks(links) }),
                    setLauncherEnabled: (enabled) => set({ launcherEnabled: enabled }),
                    resetState: () => set({ ...initialState })
                }
            }),
            { name: 'viewPreferencesStore', anonymousActionType: 'viewPreferencesStore' }
        ),
        {
            name: 'viewPreferencesStore',
            version: 3,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                launcherEnabled: state.launcherEnabled,
                launcherPosition: state.launcherPosition,
                launcherColumns: state.launcherColumns,
                quickLinks: state.quickLinks,
                nodesViewMode: state.nodesViewMode,
                nodesCardColumns: state.nodesCardColumns,
                nodesActiveTag: state.nodesActiveTag,
                hostsViewMode: state.hostsViewMode,
                hostsCardColumns: state.hostsCardColumns,
                hostsActiveTag: state.hostsActiveTag,
                sectionActiveTags: state.sectionActiveTags
            }),
            migrate: migrateState,
            merge: (persistedState, currentState) => {
                const state = (persistedState ?? {}) as Partial<IState>

                return {
                    ...currentState,
                    ...state,
                    actions: currentState.actions,
                    nodesCardColumns: state.nodesCardColumns === 2 ? 2 : 1,
                    hostsCardColumns: state.hostsCardColumns === 2 ? 2 : 1,
                    launcherEnabled: state.launcherEnabled === true,
                    launcherColumns: sanitizeLauncherColumns(state.launcherColumns),
                    launcherPosition: sanitizeLauncherPosition(state.launcherPosition),
                    quickLinks: state.quickLinks
                        ? sanitizeQuickLinks(state.quickLinks)
                        : currentState.quickLinks
                }
            }
        }
    )
)

export const useNodesViewMode = () => useViewPreferencesStore((state) => state.nodesViewMode)
export const useNodesCardColumns = () => useViewPreferencesStore((state) => state.nodesCardColumns)
export const useNodesActiveTag = () => useViewPreferencesStore((state) => state.nodesActiveTag)
export const useViewPreferencesStoreActions = () =>
    useViewPreferencesStore((state) => state.actions)
export const useHostsViewMode = () => useViewPreferencesStore((state) => state.hostsViewMode)
export const useHostsCardColumns = () => useViewPreferencesStore((state) => state.hostsCardColumns)
export const useHostsActiveTag = () => useViewPreferencesStore((state) => state.hostsActiveTag)
export const useLauncherPosition = () => useViewPreferencesStore((state) => state.launcherPosition)
export const useLauncherColumns = () => useViewPreferencesStore((state) => state.launcherColumns)
export const useQuickLinks = () => useViewPreferencesStore((state) => state.quickLinks)

export const useSectionActiveTag = (section: string) =>
    useViewPreferencesStore((state) => state.sectionActiveTags[section] ?? null)
export const useLauncherEnabled = () => useViewPreferencesStore((state) => state.launcherEnabled)

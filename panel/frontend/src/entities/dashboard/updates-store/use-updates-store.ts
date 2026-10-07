import axios from 'axios'
import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import { sToMs } from '@shared/utils/time-utils'

const CACHE_TIME = sToMs(24 * 60 * 60)

export interface IRemnawaveInfo {
    latestVersion: string
    starsCount?: number
}

interface IState {
    isLoading: boolean
    lastUpdateTimestamp: number
    remnawaveInfo: IRemnawaveInfo
}

interface IActions {
    actions: {
        getRemnawaveInfo: () => Promise<void>
        resetState: () => void
        setRemnawaveInfo: (info: IRemnawaveInfo) => void
    }
}

const initialState: IState = {
    isLoading: false,
    lastUpdateTimestamp: 0,
    remnawaveInfo: {
        latestVersion: '0.0.0',
        starsCount: undefined
    }
}

export const useUpdatesStore = create<IActions & IState>()(
    persist(
        devtools(
            (set, get) => ({
                ...initialState,
                actions: {
                    getRemnawaveInfo: async () => {
                        const { lastUpdateTimestamp, remnawaveInfo } = get()
                        const now = Date.now()

                        if (
                            lastUpdateTimestamp &&
                            now - lastUpdateTimestamp < CACHE_TIME &&
                            remnawaveInfo.starsCount !== undefined
                        ) {
                            return
                        }

                        if (get().isLoading) return
                        try {
                            set({ isLoading: true })

                            const [repo, release] = await Promise.allSettled([
                                axios.get<{ stargazers_count: number }>(
                                    'https://api.github.com/repos/lottman/remnacust',
                                    { timeout: 8000 }
                                ),
                                axios.get<{ tag_name: string }>(
                                    'https://api.github.com/repos/lottman/remnacust/releases/latest',
                                    { timeout: 8000 }
                                )
                            ])
                            const tag =
                                release.status === 'fulfilled'
                                    ? release.value.data.tag_name.replace(/^v/, '')
                                    : ''
                            const stars =
                                repo.status === 'fulfilled'
                                    ? repo.value.data.stargazers_count
                                    : undefined
                            set({
                                remnawaveInfo: {
                                    latestVersion: /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag)
                                        ? tag
                                        : remnawaveInfo.latestVersion,
                                    starsCount:
                                        Number.isSafeInteger(stars) && stars! >= 0
                                            ? stars
                                            : remnawaveInfo.starsCount
                                },
                                lastUpdateTimestamp:
                                    repo.status === 'fulfilled' ? now : lastUpdateTimestamp
                            })
                        } catch {
                            // silent error
                        } finally {
                            set({ isLoading: false })
                        }
                    },

                    setRemnawaveInfo: (info: IRemnawaveInfo) => {
                        set({ remnawaveInfo: info, lastUpdateTimestamp: Date.now() })
                    },
                    resetState: () => {
                        set({ ...initialState })
                    }
                }
            }),
            { name: 'updatesStore', anonymousActionType: 'updatesStore' }
        ),
        {
            name: 'remnacustUpdatesStore',
            storage: createJSONStorage(() => localStorage),
            version: 2,
            partialize: (state) => ({
                lastUpdateTimestamp: state.lastUpdateTimestamp,
                remnawaveInfo: state.remnawaveInfo
            })
        }
    )
)

export const useRemnawaveInfo = () => useUpdatesStore((state) => state.remnawaveInfo)
export const useLastUpdateTimestamp = () => useUpdatesStore((state) => state.lastUpdateTimestamp)
export const useIsLoadingRemnawaveUpdates = () => useUpdatesStore((state) => state.isLoading)
export const useUpdatesStoreActions = () => useUpdatesStore((state) => state.actions)

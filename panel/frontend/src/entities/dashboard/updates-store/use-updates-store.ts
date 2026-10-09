import axios from 'axios'
import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import { isValidPanelVersion } from '@shared/utils/panel-version'
import { sToMs } from '@shared/utils/time-utils'

const CACHE_TIME = sToMs(60 * 60)
const INSTALLER_REPO = 'lottman/Remnacust-installer'

interface InstallerRelease {
    tag_name: string
    draft: boolean
    prerelease: boolean
    assets: { name: string; state: string; size: number; digest: string }[]
}

async function getInstallablePanelVersion(): Promise<string> {
    const { data: release } = await axios.get<InstallerRelease>(
        `https://api.github.com/repos/${INSTALLER_REPO}/releases/latest`,
        { timeout: 8000 }
    )
    const tag = release.tag_name
    if (!/^v\d+\.\d+\.\d+$/.test(tag) || release.draft || release.prerelease) return ''
    const requiredAssets = ['installer.sh', 'SHA256SUMS', `remnacust-runtime-${tag}.tar.gz`]
    if (
        !requiredAssets.every((name) =>
            release.assets?.some(
                (asset) =>
                    asset.name === name &&
                    asset.state === 'uploaded' &&
                    asset.size > 0 &&
                    /^sha256:[a-f0-9]{64}$/.test(asset.digest)
            )
        )
    )
        return ''
    const { data: file } = await axios.get<{ encoding: string; content: string }>(
        `https://api.github.com/repos/${INSTALLER_REPO}/contents/component-sources.json?ref=${encodeURIComponent(tag)}`,
        { timeout: 8000 }
    )
    if (
        file.encoding !== 'base64' ||
        typeof file.content !== 'string' ||
        file.content.length > 128000
    )
        return ''
    const lock = JSON.parse(atob(file.content.replace(/\s/g, '')))
    const panel = lock?.panel
    return panel?.repository === 'lottman/Remnacust-panel' &&
        /^[a-f0-9]{40}$/.test(panel.commit) &&
        isValidPanelVersion(panel.version)
        ? panel.version
        : ''
}

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
                            now >= lastUpdateTimestamp &&
                            now - lastUpdateTimestamp < CACHE_TIME &&
                            remnawaveInfo.latestVersion !== '0.0.0' &&
                            isValidPanelVersion(remnawaveInfo.latestVersion) &&
                            remnawaveInfo.starsCount !== undefined
                        ) {
                            return
                        }

                        if (get().isLoading) return
                        try {
                            set({ isLoading: true })

                            const [repo, release] = await Promise.allSettled([
                                axios.get<{ stargazers_count: number }>(
                                    'https://api.github.com/repos/lottman/Remnacust-panel',
                                    { timeout: 8000 }
                                ),
                                getInstallablePanelVersion()
                            ])
                            const tag = release.status === 'fulfilled' ? release.value : ''
                            const stars =
                                repo.status === 'fulfilled'
                                    ? repo.value.data.stargazers_count
                                    : undefined
                            const hasRelease = isValidPanelVersion(tag)
                            const hasStars = Number.isSafeInteger(stars) && stars! >= 0
                            set({
                                remnawaveInfo: {
                                    latestVersion: hasRelease ? tag : remnawaveInfo.latestVersion,
                                    starsCount: hasStars ? stars : remnawaveInfo.starsCount
                                },
                                lastUpdateTimestamp:
                                    hasRelease && hasStars ? now : lastUpdateTimestamp
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
            version: 3,
            migrate: () => initialState,
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

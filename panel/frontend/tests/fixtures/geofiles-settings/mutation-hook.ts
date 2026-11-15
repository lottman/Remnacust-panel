import { useSettingsMutation } from './api'

export function createMutationHook(configuration: Parameters<typeof useSettingsMutation>[0]) {
    return function useBoundarySettingsMutation(
        params?: Parameters<typeof useSettingsMutation>[1]
    ) {
        return useSettingsMutation(configuration, params)
    }
}

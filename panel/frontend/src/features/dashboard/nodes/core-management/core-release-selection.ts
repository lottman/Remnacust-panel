export function selectCoreRelease(releases: readonly { id: string }[], selected: string | null) {
    return releases.find((release) => release.id === selected)?.id ?? releases[0]?.id
}

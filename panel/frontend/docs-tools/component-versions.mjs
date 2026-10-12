import fs from 'node:fs'
import path from 'node:path'

export function getCompatibilityVersions(root) {
    const filename = [
        path.resolve(root, '../../docs/COMPATIBILITY.md'),
        path.resolve(root, '../docs/COMPATIBILITY.md')
    ].find((candidate) => fs.existsSync(candidate))
    if (!filename) throw new Error('Missing authoritative component compatibility table')
    const table = fs.readFileSync(filename, 'utf8')
    const versions = {}
    for (const [field, label] of [
        ['backendVersion', 'Backend и frontend'],
        ['nodeVersion', 'Агент ноды'],
        ['coreVersion', 'Ядро']
    ]) {
        const rows = [
            ...table.matchAll(
                new RegExp(
                    `^\\|\\s*${label}\\s*\\|\\s*(\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?)(?:-remnacust)?\\s*\\|`,
                    'gm'
                )
            )
        ]
        if (rows.length !== 1)
            throw new Error(`Missing or ambiguous compatibility version: ${label}`)
        versions[field] = rows[0][1]
    }
    return versions
}

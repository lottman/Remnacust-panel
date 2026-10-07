import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/shared/api/hooks/', import.meta.url))
const entities = new Set([
    'Api token',
    'Passkey',
    'Config',
    'External Squad',
    'Host',
    'Hosts',
    'Infra Provider',
    'Infra Billing History Record',
    'Infra Billing Node',
    'Internal Squad',
    'Node integration',
    'Node plugin',
    'Shared list',
    'Node',
    'Node traffic',
    'Nodes',
    'Remnawave settings',
    'Snippet',
    'Subscription page config',
    'Subscription settings',
    'Subscription template',
    'User',
    'User subscription',
    'User traffic'
])
const specials = new Set([
    'User registered successfully',
    'Request sent',
    'Reports truncated successfully',
    'Sync queued for nodes with this plugin',
    'Sync queued for nodes using this list',
    'Please wait for the nodes to reconnect',
    'Task added to queue successfully.',
    'Task added to queue successfully',
    'Actions added to queue successfully.',
    'Nodes updated successfully.',
    'Passkey verification successful',
    'Users expiration date extended successfully',
    'All users expiration date extended successfully'
])
const verbs =
    /^(.*?) (created|updated|deleted|enabled|disabled|cloned|synced|restarted|reset|authenticated|revoked) successfully\.?$/
const unknown = new Set()
let changed = 0

async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
            await visit(path)
            continue
        }
        if (!/\.tsx?$/.test(entry.name)) continue
        const original = await readFile(path, 'utf8')
        let updated = original.replace(/\bmessage: '([^']+)'/g, (full, message) => {
            const match = message.match(verbs)
            if (!specials.has(message) && !(match && entities.has(match[1]))) {
                unknown.add(message)
                return full
            }
            changed++
            return `message: translateMutationMessage('${message}')`
        })
        if (updated === original) continue
        if (
            !updated.includes(
                "import { translateMutationMessage } from '@shared/utils/translate-mutation-message'"
            )
        ) {
            updated = `import { translateMutationMessage } from '@shared/utils/translate-mutation-message'\n${updated}`
        }
        await writeFile(path, updated)
    }
}

await visit(root)
console.log(`Localized ${changed} mutation messages.`)
if (unknown.size) console.log(`Unmatched messages: ${[...unknown].join(' | ')}`)

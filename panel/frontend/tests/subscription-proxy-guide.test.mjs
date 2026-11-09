import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { subscriptionProxyGuide as article } from '../docs-tools/subscription-proxy-guide.mjs'

for (const language of ['ru', 'en', 'fa', 'zh']) {
    test(
        `proxy verification commands use the entered key and private output directory (${language})`,
        { skip: process.platform === 'win32' },
        () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-proxy-command-'))
            try {
                const section = article.sections.find((s) => s.id === 'subscription-proxy-verify')[
                    language
                ]
                const command = /```bash\n([\s\S]*?)\n```/.exec(section.body)[1]
                const syntax = spawnSync('bash', ['-n'], { input: command, encoding: 'utf8' })
                assert.equal(syntax.status, 0, syntax.stderr)
                const output = path.join(directory, 'arguments')
                const script = `curl() { printf '%s\\0' "$@" >> "$OUT"; }\n` + command
                const result = spawnSync('bash', ['-e', '-c', script], {
                    input: 'fixture-key_123\n',
                    encoding: 'utf8',
                    env: { ...process.env, TMPDIR: directory, OUT: output }
                })
                assert.equal(result.status, 0, result.stderr)
                assert.equal(result.stdout, '')
                const args = fs.readFileSync(output, 'utf8').split('\0').filter(Boolean)
                const urls = args.filter((a) => a.startsWith('https://'))
                assert.deepEqual(urls, [
                    'https://origin.example.net/fixture-key_123/json',
                    'https://sub.example.net/fixture-key_123/json'
                ])
                const files = args.flatMap((a, i) => (a === '-o' ? [args[i + 1]] : []))
                assert.equal(files.length, 2)
                assert.equal(path.dirname(files[0]), path.dirname(files[1]))
                for (const file of files) {
                    assert.ok(
                        path.relative(directory, file) &&
                            !path.relative(directory, file).startsWith('..')
                    )
                    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700)
                }
            } finally {
                fs.rmSync(directory, { recursive: true, force: true })
            }
        }
    )
}

import assert from 'node:assert/strict'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from 'vite'

function request(port, headers) {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/src/shared/ui/appearance/use-icon-motion.ts', headers }, (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => { body += chunk })
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
        })
        req.setTimeout(10_000, () => req.destroy(new Error('Dev server timed out')))
        req.on('error', reject)
    })
}

test('the development server binds locally and refuses foreign hosts and CORS origins', async () => {
    process.env.NODE_ENV = 'development'
    const root = fileURLToPath(new URL('../', import.meta.url))
    // This test requests source text; dependency prebundling is unrelated to host checks.
    const server = await createServer({ root, optimizeDeps: { noDiscovery: true, include: [] }, server: { port: 0, strictPort: false } })
    try {
        await server.listen()
        const address = server.httpServer.address()
        assert.equal(address.address, '127.0.0.1')
        const trusted = await request(address.port, { Host: 'localhost' })
        assert.equal(trusted.status, 200)
        assert.match(trusted.body, /useIconMotion/)
        const foreignHost = await request(address.port, { Host: 'untrusted.example' })
        assert.equal(foreignHost.status, 403)
        const foreignOrigin = await request(address.port, { Host: 'localhost', Origin: 'https://untrusted.example' })
        assert.equal(foreignOrigin.headers['access-control-allow-origin'], undefined)
    } finally {
        await server.close()
    }
})

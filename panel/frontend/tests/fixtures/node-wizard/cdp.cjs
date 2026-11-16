const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function launchBrowser() {
    const executable = [process.env.NODE_WIZARD_CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && fs.existsSync(value))
    if (!executable) throw new Error('Set NODE_WIZARD_CHROME to a local Chrome/Chromium executable')
    const profile = path.resolve(__dirname, '.browser-profile-' + randomUUID())
    const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--window-size=1280,1000', '--remote-debugging-port=0', '--remote-allow-origins=http://127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true })
    let startupError
    child.on('error', error => { startupError = error })
    let socket
    const close = async () => {
        try { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })) } catch {}
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)])
        try { socket?.close() } catch {}
        if (child.exitCode === null) child.kill()
        if (path.dirname(profile) !== path.resolve(__dirname) || !path.basename(profile).startsWith('.browser-profile-')) throw new Error('Unexpected browser profile path')
        for (let attempt = 0; attempt < 30; attempt++) {
            try { fs.rmSync(profile, { recursive: true, force: true }); break } catch { await sleep(100) }
        }
    }
    try {
        const activePort = path.join(profile, 'DevToolsActivePort')
        let port
        for (let attempt = 0; attempt < 150; attempt++) {
            if (startupError) throw startupError
            if (child.exitCode !== null) throw new Error('Chrome exited before publishing its debugging port')
            try {
                port = Number(fs.readFileSync(activePort, 'utf8').split(/\r?\n/)[0])
                if (port > 0 && port < 65536) break
            } catch (error) {
                if (!['ENOENT', 'EBUSY', 'EPERM'].includes(error.code)) throw error
            }
            await sleep(100)
        }
        if (!port) throw new Error('Chrome did not publish a debugging port')
        const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
        socket = new WebSocket(target.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
        let next = 0
        const pending = new Map()
        const consoleErrors = []
        const send = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++next
            const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)) }, 20000)
            pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value) }, reject: error => { clearTimeout(timeout); reject(error) } })
            socket.send(JSON.stringify({ id, method, params }))
        })
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data)
            if (message.id) {
                const operation = pending.get(message.id)
                pending.delete(message.id)
                if (message.error) operation?.reject(new Error(message.error.message))
                else operation?.resolve(message.result)
            } else if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
            else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') consoleErrors.push(message.params.entry.text)
            else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '))
        })
        await send('Page.enable')
        await send('Runtime.enable')
        await send('Log.enable')
        await send('Page.bringToFront')
        await send('Emulation.setFocusEmulationEnabled', { enabled: true })
        const evaluate = async expression => {
            const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
            if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
            return response.result.value
        }
        const waitFor = async (expression, timeout = 15000) => {
            const until = Date.now() + timeout
            do { if (await evaluate(expression)) return; await sleep(50) } while (Date.now() < until)
            throw new Error('Timed out waiting for: ' + expression + (consoleErrors.length ? '\n' + consoleErrors.join('\n') : ''))
        }
        return { send, evaluate, waitFor, close, consoleErrors, navigate: async (url, readyTimeout) => { await send('Page.navigate', { url }); await waitFor('!!window.nodeWizardFixture', readyTimeout) } }
    } catch (error) { await close(); throw error }
}
module.exports = { launchBrowser }

if (require.main === module) (async () => {
    const browser = await launchBrowser()
    try {
        await browser.navigate(process.argv[2] || 'http://127.0.0.1:4347/')
        console.log(await browser.evaluate('({ title: document.title, text: document.body.innerText, errors: [] })'))
    } finally { await browser.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })

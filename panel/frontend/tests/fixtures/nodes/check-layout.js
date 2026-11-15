globalThis.checkNodeLayout = async function checkNodeLayout(page) {
    await page.route('**/*', (route) => {
        const host = new URL(route.request().url()).hostname
        return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
    })
    await page.goto('http://127.0.0.1:4317/')
    await page.evaluate(() => {
        const key = 'nodes-datatable-nodes-v8-columns-order'
        const order = JSON.parse(localStorage.getItem(key) || '[]')
        localStorage.setItem(key, JSON.stringify(order.filter((accessor) => accessor !== 'proxy')))
    })
    await page.reload()
    const results = []
    for (const [language, width] of [
        ['en', 1440],
        ['en', 412],
        ['fa', 1440],
        ['fa', 412]
    ]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.getByRole('button', { name: language, exact: true }).click()
        await page.locator('html').evaluate((element, language) => {
            if (element.lang !== language) throw new Error('Locale did not update')
        }, language)
        const measurements = await page.evaluate(() => {
            const table = document.querySelector('table')
            const header = [...table.tHead.rows[0].cells]
                .at(-1)
                .querySelector('svg')
                .getBoundingClientRect()
            const buttons = [...table.querySelectorAll('tbody tr td:last-child button')].map(
                (button) => button.getBoundingClientRect()
            )
            return {
                width: innerWidth,
                dir: document.documentElement.dir,
                overflow: document.documentElement.scrollWidth > innerWidth,
                editAlignment: buttons.map((button) =>
                    Math.abs(button.x + button.width / 2 - header.x - header.width / 2)
                ),
                exposedProxy:
                    document.body.innerText.includes('socks5://') ||
                    document.body.innerText.includes('synthetic-only')
            }
        })
        if (measurements.overflow) throw new Error(`Page overflow at ${language}/${width}`)
        if (measurements.exposedProxy) throw new Error('Proxy value exposed')
        if (measurements.editAlignment.some((difference) => difference > 1))
            throw new Error(`Edit action misaligned at ${language}/${width}`)
        if (measurements.dir !== (language === 'fa' ? 'rtl' : 'ltr'))
            throw new Error('Direction mismatch')
        results.push({ language, ...measurements })
        await page.screenshot({
            path: `C:/Users/root/AppData/Local/Temp/rc-nodes-${language}-${width}.png`,
            fullPage: true
        })
    }
    await page.getByRole('button', { name: 'en', exact: true }).click()
    const edit = page.getByRole('button', { name: 'Edit: Proxy IPv6 node', exact: true })
    await edit.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('status').filter({ hasText: 'Edited node: node-proxy' }).waitFor()
    return { results, keyboardEdit: true }
}

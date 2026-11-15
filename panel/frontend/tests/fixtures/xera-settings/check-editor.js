globalThis.checkXeraEditor = async function checkXeraEditor(page) {
    await page.route('**/*', (route) => {
        const host = new URL(route.request().url()).hostname
        return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('http://127.0.0.1:4318/')
    await page.waitForFunction(() => window.xeraFixture?.text())
    const initial = await page.evaluate(() => window.xeraFixture.initial)
    const text = () => page.evaluate(() => window.xeraFixture.text())
    const saves = () => page.evaluate(() => window.xeraFixture.saves.length)
    const open = page.getByRole('button', { name: 'Xera HTTP adaptive', exact: true })
    await open.focus()
    await page.keyboard.press('Enter')
    await page
        .getByText(
            'Client preferences for host subscriptions generated from this inbound. Server request limits are configured separately.',
            { exact: true }
        )
        .waitFor()
    if ((await text()) !== initial || (await saves()) !== 0)
        throw new Error('Opening converted or saved manual settings')
    const enable = page.getByRole('button', { name: 'Enable adaptive', exact: true })
    await enable.focus()
    await page.keyboard.press('Enter')
    if ((await text()) !== initial || (await saves()) !== 0)
        throw new Error('Enabling changed the draft')
    const minimum = page.getByRole('textbox', { name: 'Minimum active HTTP requests', exact: true })
    const maximum = page.getByRole('textbox', { name: 'Maximum active HTTP requests', exact: true })
    const apply = page.getByRole('button', { name: 'Apply in JSON', exact: true })
    await minimum.fill('20')
    await maximum.fill('8')
    if (!(await apply.isDisabled())) throw new Error('Invalid bounds can be applied')
    await page
        .getByText('Use whole numbers from 1 to 32; minimum must not exceed maximum.', {
            exact: true
        })
        .waitFor()
    await minimum.fill('4')
    await maximum.fill('32')
    await apply.focus()
    await page.keyboard.press('Enter')
    await page
        .getByText('JSON draft updated. Save the profile to apply it.', { exact: true })
        .waitFor()
    const applied = JSON.parse(await text())
    const before = JSON.parse(initial)
    const adaptive = applied.inbounds[0].streamSettings.xeraHttpSettings.extra.adaptive
    if (
        JSON.stringify(adaptive) !==
        JSON.stringify({ mode: 'balanced', minStreams: 4, maxStreams: 32 })
    )
        throw new Error('Wrong adaptive path or defaults')
    delete applied.inbounds[0].streamSettings.xeraHttpSettings.extra.adaptive
    if (JSON.stringify(applied) !== JSON.stringify(before))
        throw new Error('Apply changed unrelated manual settings')
    if ((await saves()) !== 0) throw new Error('Apply saved automatically')
    await page.evaluate(() => window.xeraFixture.undo())
    await page.waitForFunction((initial) => window.xeraFixture.text() === initial, initial)
    await page.getByRole('combobox', { name: 'Existing Xera HTTP transport', exact: true }).click()
    await page
        .getByRole('option', { name: 'Outbound client transport · XERA-CLIENT', exact: true })
        .click()
    await page
        .getByText('Client preferences for this outbound transport.', { exact: true })
        .waitFor()
    await enable.click()
    await apply.click()
    const outboundText = await text()
    const outbound = JSON.parse(outboundText)
    if (outbound.inbounds[0].streamSettings.xeraHttpSettings.extra.adaptive)
        throw new Error('Wrong target updated')
    if (!outbound.outbounds[0].streamSettings.xeraHttpSettings.adaptive)
        throw new Error('Outbound adaptive missing')
    const jsonc = outboundText.replace('{', '{\n  // operator comment retained')
    await page.evaluate((value) => window.xeraFixture.replace(value), jsonc)
    await minimum.fill('3')
    await apply.click()
    if (!(await text()).includes('// operator comment retained'))
        throw new Error('JSONC comments lost')
    if ((await saves()) !== 0) throw new Error('JSONC editing saved automatically')
    await page.evaluate(() => window.xeraFixture.replace('{broken'))
    await page
        .getByText('Fix parsing errors in the JSON draft before using these controls.', {
            exact: true
        })
        .waitFor()
    if (await apply.count()) throw new Error('Parser errors left Apply available')
    await page.evaluate((value) => window.xeraFixture.replace(value), outboundText)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
    if ((await saves()) !== 1) throw new Error('Explicit Save not captured')
    const screenshots = []
    for (const [language, width] of [
        ['en', 1440],
        ['en', 412],
        ['fa', 412],
        ['fa', 1440]
    ]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.getByRole('button', { name: language, exact: true }).click()
        const layout = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            dir: document.documentElement.dir,
            editorHeight: document.querySelector('.monaco-editor').getBoundingClientRect().height,
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
        }))
        if (layout.overflow || layout.editorHeight < 100)
            throw new Error(
                `Editor layout broken at ${language}/${width}: ${JSON.stringify(layout)}`
            )
        if (layout.dir !== (language === 'fa' ? 'rtl' : 'ltr'))
            throw new Error('Direction not updated')
        await page.screenshot({
            path: `C:/Users/root/AppData/Local/Temp/rc-xera-settings-${language}-${width}.png`,
            fullPage: true
        })
        screenshots.push({ language, width, ...layout })
    }
    await page.goto('http://127.0.0.1:4318/?mode=default')
    await page.waitForFunction(() => window.xeraFixture?.text())
    await page.getByRole('button', { name: 'Xera HTTP adaptive', exact: true }).click()
    if (!(await enable.isDisabled())) throw new Error('Default Core mode allows conversion')
    await page
        .getByText(
            'Xera HTTP adaptive requires custom Core mode and Remnacust Core 1.1.22 or newer in clients.',
            { exact: true }
        )
        .waitFor()
    if (errors.length) throw new Error(errors.join('\n'))
    return {
        keyboardApply: true,
        noAutomaticSave: true,
        undo: true,
        jsoncPreserved: true,
        parserErrorsBlocked: true,
        defaultModeBlocked: true,
        screenshots
    }
}

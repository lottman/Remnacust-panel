globalThis.checkNodeConsumers = async function checkNodeConsumers(page) {
    await page.goto('http://127.0.0.1:4317/')
    await page.setViewportSize({ width: 412, height: 1000 })
    const ssh = page.getByTestId('ssh-setup')
    const host = ssh.getByRole('combobox')
    if ((await host.inputValue()) !== 'node_service')
        throw new Error('SSH default reused the disabled anchor')
    await host.fill('2001:db8::42')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await ssh.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'SSH target: 2001:db8::42' }).waitFor()
    await page.getByRole('button', { name: 'Toggle all panel addresses', exact: true }).click()
    await ssh
        .getByText(
            'Panel management is off for all addresses. You can still choose any configured address for this manual SSH session.',
            { exact: true }
        )
        .waitFor()
    if (await ssh.getByRole('button', { name: 'Connect', exact: true }).isDisabled())
        throw new Error('Disabled management incorrectly banned manual SSH')
    await host.fill('unconfigured.example.test')
    if (!(await ssh.getByRole('button', { name: 'Connect', exact: true }).isDisabled()))
        throw new Error('Unknown SSH destination accepted')
    await host.fill('2001:db8::42')
    const geo = page.getByTestId('geocheck')
    const source = geo.getByRole('radio', { name: 'IP address', exact: true })
    await source.focus()
    await page.keyboard.press('Space')
    if (!(await source.isChecked())) throw new Error('GeoCheck keyboard source selection failed')
    const ip = geo.getByRole('combobox')
    await ip.click()
    const choices = await page.getByRole('option').allTextContents()
    if (choices.some((value) => value.includes('node_service') || value.includes('.test')))
        throw new Error('GeoCheck offers a hostname')
    if (!choices.some((value) => value.includes('2001:db8::42')))
        throw new Error('GeoCheck omitted a disabled canonical IPv6')
    await ip.fill('2001:db8::42')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await geo.getByRole('button', { name: 'Run check', exact: true }).click()
    await page
        .getByRole('status')
        .filter({ hasText: 'Geo source: {"ip":"2001:db8::42"}' })
        .waitFor()
    await page.getByRole('button', { name: 'fa', exact: true }).click()
    const metrics = await page.evaluate(() => ({
        width: innerWidth,
        direction: document.documentElement.dir,
        overflow: document.documentElement.scrollWidth > innerWidth
    }))
    if (metrics.direction !== 'rtl' || metrics.overflow)
        throw new Error('Consumer layout failed at 412 RTL')
    await page.screenshot({
        path: 'C:/Users/root/AppData/Local/Temp/rc-nodes-consumers-fa-412.png',
        fullPage: true
    })
    return {
        canonicalSshSelection: true,
        disabledManualSshAllowed: true,
        unknownSshRejected: true,
        geocheckLiteralUnion: true,
        ...metrics
    }
}

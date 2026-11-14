globalThis.checkRemarksLayout = async (page) => {
    const ensure = (value, message) => {
        if (!value) throw new Error(message)
    }
    await page.setViewportSize({ width: 412, height: 915 })
    await page.getByRole('button', { name: 'en', exact: true }).click()
    if (!(await page.getByRole('textbox', { name: 'Message row 1', exact: true }).count()))
        await page.getByRole('button', { name: 'Add expiry rule', exact: true }).click()
    const down = page.getByRole('button', { name: 'Move down', exact: true }).first()
    await down.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Saved · refresh the client subscription', { exact: true }).waitFor()
    const payload = JSON.parse(await page.getByTestId('saved-payload').textContent())
    ensure(
        payload.activeExpiry.rules[0].remarks[0] === '{HOSTS}',
        'keyboard reorder lost host position'
    )
    const english = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        direction: document.documentElement.dir,
        inputs: [...document.querySelectorAll('form input')]
            .filter((input) => input.getBoundingClientRect().width)
            .map((input) => ({
                label: input.getAttribute('aria-label'),
                left: input.getBoundingClientRect().left,
                right: input.getBoundingClientRect().right
            }))
    }))
    ensure(english.scrollWidth <= english.width, '412px English overflow')
    await page.getByRole('button', { name: 'fa', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.dir === 'rtl')
    const persian = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        direction: document.documentElement.dir,
        font: getComputedStyle(document.querySelector('form')).fontFamily
    }))
    ensure(persian.scrollWidth <= persian.width, '412px Persian overflow')
    ensure(
        (await page.getByRole('textbox').filter({ visible: true }).count()) > 0,
        'Persian controls missing'
    )
    await page.screenshot({ path: 'output/playwright/remarks-412-fa.png', fullPage: true })
    await page.getByRole('button', { name: 'ru', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.dir === 'ltr')
    ensure(
        !(await page.getByText('interface.remarks-', { exact: false }).count()),
        'Russian key leak'
    )
    await page.getByRole('button', { name: 'zh', exact: true }).click()
    ensure(
        !(await page.getByText('interface.remarks-', { exact: false }).count()),
        'Chinese key leak'
    )
    await page.getByRole('button', { name: 'en', exact: true }).click()
    return {
        english,
        persian,
        result: 'PASS 412px EN/FA RTL and keyboard host reorder'
    }
}

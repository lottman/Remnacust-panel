globalThis.checkRemarksExternal = async (page) => {
    const ensure = (value, message) => {
        if (!value) throw new Error(message)
    }
    const dialog = page.getByRole('dialog', { name: 'External squad fixture', exact: true })
    await dialog.getByRole('switch', { name: /^Enable override/ }).check()
    const note = dialog.getByRole('textbox', { name: 'Message row 1', exact: true })
    await note.fill('External draft')
    await dialog.getByRole('tab', { name: 'Squad other', exact: true }).click()
    await dialog.getByRole('tab', { name: 'Squad remarks', exact: true }).click()
    ensure((await note.inputValue()) === 'External draft', 'external tab switch lost draft')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByText('Saved · refresh the client subscription', { exact: true }).waitFor()
    const payload = JSON.parse(await page.getByTestId('saved-payload').textContent())
    ensure(
        payload.activeExpiry.rules[0].remarks[0] === 'External draft',
        'external payload lost draft'
    )
    await dialog.getByRole('switch', { name: /^Enable override/ }).uncheck()
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByText('Saved · refresh the client subscription', { exact: true }).waitFor()
    ensure(
        (await page.getByTestId('saved-payload').textContent()) === 'null',
        'inheritance did not save null'
    )
    await page.keyboard.press('Escape')
    return 'PASS External Squad full replacement, tab retention and null inheritance'
}

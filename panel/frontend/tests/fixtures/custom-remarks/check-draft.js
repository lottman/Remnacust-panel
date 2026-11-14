globalThis.checkRemarksDraft = async (page) => {
    const note = page.getByRole('textbox', { name: 'Message row 1', exact: true })
    const ensure = (value, message) => {
        if (!value) throw new Error(message)
    }
    await note.fill('Browser draft {{DAYS_LEFT}}')
    await page.getByRole('button', { name: 'Equal refetch', exact: true }).click()
    ensure((await note.inputValue()) === 'Browser draft {{DAYS_LEFT}}', 'equal refetch lost draft')
    await page.getByRole('tab', { name: 'Other fixture', exact: true }).click()
    await page.getByRole('tab', { name: 'Remarks fixture', exact: true }).click()
    ensure((await note.inputValue()) === 'Browser draft {{DAYS_LEFT}}', 'tab switch lost draft')
    await page.getByRole('button', { name: 'Save failure: false', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Fixture save failed', { exact: true }).waitFor()
    ensure((await note.inputValue()) === 'Browser draft {{DAYS_LEFT}}', 'failed save lost draft')
    await page.getByRole('button', { name: 'Save failure: true', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Saved · refresh the client subscription', { exact: true }).waitFor()
    const payload = JSON.parse(await page.getByTestId('saved-payload').textContent())
    ensure(payload.activeExpiry.rules[0].remarks[1] === '{HOSTS}', 'host marker lost on save')
    ensure(
        payload.activeExpiry.rules[0].remarks[0] === 'Browser draft {{DAYS_LEFT}}',
        'note lost on save'
    )
    await note.fill('New unsaved draft')
    await page.getByRole('button', { name: 'Remote change', exact: true }).click()
    await page.getByText('Settings changed on the server', { exact: true }).waitFor()
    ensure((await note.inputValue()) === 'New unsaved draft', 'remote change lost draft')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    ensure(
        (await note.inputValue()) === 'Browser draft {{DAYS_LEFT}}',
        'reset did not load latest remote'
    )
    return 'PASS equal refetch, tab retention, failed save, successful payload, conflict and Reset'
}

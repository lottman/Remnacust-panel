globalThis.checkRemarksScope = async (page) => {
    const ensure = (value, message) => {
        if (!value) throw new Error(message)
    }
    await page.getByRole('combobox', { name: 'Who receives this message', exact: true }).click()
    await page.getByRole('option', { name: 'Selected squads', exact: true }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Check the marked sections before saving.', { exact: true }).waitFor()
    await page.getByRole('combobox', { name: 'Internal Squads', exact: true }).click()
    await page.getByRole('option', { name: 'Example internal squad', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('combobox', { name: 'External Squads', exact: true }).click()
    await page.getByRole('option', { name: 'Example external squad', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Loading squads', exact: true }).click()
    await page
        .getByText('Loading squad names; saved selections are preserved.', { exact: true })
        .waitFor()
    await page.getByRole('button', { name: 'Squad error', exact: true }).click()
    await page.getByText('Could not load all squad names', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Saved · refresh the client subscription', { exact: true }).waitFor()
    let payload = JSON.parse(await page.getByTestId('saved-payload').textContent())
    ensure(
        payload.activeExpiry.rules[0].internalSquadUuids[0] ===
            '10000000-0000-4000-8000-000000000002',
        'internal ID lost'
    )
    ensure(
        payload.activeExpiry.rules[0].externalSquadUuids[0] ===
            '10000000-0000-4000-8000-000000000003',
        'external ID lost'
    )
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('button', { name: 'Remove message row 2', exact: true }).click()
    await page.getByText('This rule contains no {HOSTS} block.', { exact: false }).waitFor()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByText('Saved · refresh the client subscription', { exact: true }).waitFor()
    payload = JSON.parse(await page.getByTestId('saved-payload').textContent())
    ensure(payload.activeExpiry.rules[0].remarks.length === 1, 'notes-only was not saved')
    ensure(!payload.activeExpiry.rules[0].remarks.includes('{HOSTS}'), 'notes-only gained a marker')
    await page.getByRole('button', { name: 'External squad', exact: true }).click()
    return 'PASS selected-scope validation, loading/error ID preservation and notes-only payload'
}

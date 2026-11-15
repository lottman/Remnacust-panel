globalThis.checkNodeAddresses = async function checkNodeAddresses(page) {
    await page.goto('http://127.0.0.1:4317/')
    await page.setViewportSize({ width: 412, height: 1000 })
    await page.getByRole('button', { name: 'Move node_service up', exact: true }).focus()
    await page.keyboard.press('Enter')
    if (
        (await page.getByRole('textbox', { name: 'Address 1', exact: true }).inputValue()) !==
        'node_service'
    )
        throw new Error('Keyboard priority change failed')
    const savedInputs = page.getByTestId('address-editor').getByRole('textbox')
    for (const input of await savedInputs.all()) {
        if (
            !(await input.getAttribute('readonly')) &&
            (await input.getAttribute('readonly')) !== ''
        )
            throw new Error('Saved address is editable')
    }
    if (await page.getByRole('button', { name: /^Discard new address/ }).count())
        throw new Error('Saved row has delete control')
    for (const name of [
        'Use node_service for panel management',
        'Use 2001:db8::11 for panel management'
    ]) {
        await page.getByRole('switch', { name, exact: true }).focus()
        await page.keyboard.press('Space')
    }
    await page
        .getByText('Panel management is off. This does not stop the VPN or the node core.', {
            exact: true
        })
        .waitFor()
    await page.getByRole('button', { name: 'Save address fixture', exact: true }).click()
    const saved = await page.getByTestId('address-save-result').innerText()
    if (JSON.parse(saved).some((entry) => entry.enabled))
        throw new Error('All-off save revived an address')
    if (JSON.parse(saved).length !== 3) throw new Error('All-off save removed an address')
    await page.getByRole('button', { name: 'Add address', exact: true }).focus()
    await page.keyboard.press('Enter')
    const draft = page.getByRole('textbox', { name: 'Address 4', exact: true })
    await draft.fill('https://node.example.test:2222/path')
    await page.getByRole('button', { name: 'Save address fixture', exact: true }).click()
    await page
        .getByText('Enter a valid IPv4, IPv6 or hostname without protocol, port or path.', {
            exact: true
        })
        .waitFor()
    await draft.fill('2001:0db8:0:0:0:0:0:11')
    await page.getByRole('button', { name: 'Save address fixture', exact: true }).click()
    await page
        .getByText(
            'This address is already in the list. IPv6 spellings and hostname case are normalized.',
            { exact: true }
        )
        .waitFor()
    if ((await draft.getAttribute('readonly')) !== null)
        throw new Error('Duplicate draft became read-only')
    await draft.fill('2001:db8::20')
    await page.getByRole('button', { name: 'Save address fixture', exact: true }).click()
    const updated = JSON.parse(await page.getByTestId('address-save-result').innerText())
    if (
        updated.length !== 4 ||
        updated.at(-1).address !== '2001:db8::20' ||
        !updated.at(-1).enabled
    )
        throw new Error('IPv6 save failed')
    if (await page.getByRole('button', { name: /^Discard new address/ }).count())
        throw new Error('Saved draft retained remove control')
    return {
        keyboardPriority: true,
        allOffPreserved: true,
        invalidRejected: true,
        ipv6DuplicateRejected: true,
        ipv6Saved: true
    }
}

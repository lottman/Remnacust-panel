import type { AddressEntry, EditorValues, WizardFixture } from './types'
import type { UseFormReturnType } from '@mantine/form'

const fixture = () => (window as unknown as { nodeWizardFixture: WizardFixture }).nodeWizardFixture
const t = (key: string, options?: Record<string, unknown>) => String(fixture().i18n.t(key, options))
const pause = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
function assert(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message)
}
async function until(predicate: () => unknown, description: string) {
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
        if (predicate()) return
        await pause(25)
    }
    throw new Error('Timed out: ' + description)
}
function input(path: string, name = 'create-node-form') {
    const result = document.querySelector<HTMLInputElement>(`[data-path="${name}-${path}"]`)
    assert(result, 'Missing actual input: ' + path)
    return result
}
async function fill(path: string, value: string, name = 'create-node-form') {
    const element = input(path, name)
    element.scrollIntoView({ block: 'nearest' })
    element.focus({ preventScroll: true })
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    await pause()
}
function button(key: string, scope: ParentNode = document) {
    const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
        (element) => element.textContent?.trim() === t(key)
    )
    assert(result, 'Missing actual button: ' + key)
    return result
}
async function click(key: string, scope: ParentNode = document) {
    const element = button(key, scope)
    element.scrollIntoView({ block: 'nearest' })
    await pause(50)
    element.focus({ preventScroll: true })
    element.click()
    await pause()
}
async function open() {
    document.querySelector<HTMLButtonElement>('[data-testid="open-wizard"]')!.click()
    await until(
        () => document.querySelector('[data-path="create-node-form-name"]'),
        'real connection step'
    )
    await pause(350)
}
async function connection(address = 'node.example.test') {
    await open()
    await fill('name', 'Regression node')
    await fill('controlAddresses.0.address', address)
}
async function popup() {
    if (!document.querySelector('[data-path="create-node-form-proxyUrl"]')) {
        await click('create-node-step-1-connection.additional-options')
        await until(
            () => document.querySelector('[data-path="create-node-form-proxyUrl"]'),
            'real PasswordInput'
        )
        await pause(200)
    }
}
async function profile() {
    await click('common.action.next')
    await until(
        () => document.querySelector('[data-path="create-node-form-configProfile"]'),
        'real profile step'
    )
    await pause(350)
}
async function chooseThroughDrawer() {
    await click('common.action.select')
    await until(
        () =>
            [...document.querySelectorAll('button[aria-controls]')].some((element) =>
                element.textContent?.includes('Synthetic profile')
            ),
        'actual NiceModal profile drawer'
    )
    const heading = [...document.querySelectorAll<HTMLButtonElement>('button[aria-controls]')].find(
        (element) => element.textContent?.includes('Synthetic profile')
    )!
    heading.click()
    await until(() => document.querySelector('[role="checkbox"]'), 'actual inbound checkbox card')
    document.querySelector<HTMLElement>('[role="checkbox"]')!.click()
    await pause()
    const save = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${t('common.action.save')}"]`
    )
    assert(save && !save.disabled, 'Actual profile save is not enabled')
    save.click()
    await until(
        () =>
            fixture().form().getValues().configProfile.activeConfigProfileUuid ===
            fixture().profileUuid,
        'profile saved through actual drawer'
    )
    await pause(350)
}
function submit() {
    const form = document
        .querySelector<HTMLFormElement>('[data-path="create-node-form-configProfile"]')
        ?.closest('form')
    assert(form, 'Missing real profile form')
    form.requestSubmit()
}
async function noCalls() {
    await pause(100)
    assert(fixture().mutation.calls.length === 0, 'Invalid values reached the create mutation')
}
const cases: Record<string, () => Promise<unknown>> = {
    async 'invalid-proxy-next'() {
        await connection()
        await popup()
        await fill('proxyUrl', 'socks5://proxy.example.test:99999')
        await click('create-node-step-1-connection.additional-options')
        await until(
            () => !document.querySelector('[data-path="create-node-form-proxyUrl"]'),
            'proxy popup closed before Next'
        )
        await click('common.action.next')
        await until(
            () =>
                fixture().form().errors.proxyUrl &&
                document.activeElement ===
                    document.querySelector('[data-path="create-node-form-proxyUrl"]'),
            'localized proxy error and focused reopened popup'
        )
        assert(
            document.querySelector('[data-path="create-node-form-name"]'),
            'Invalid proxy advanced past the connection step'
        )
        assert(input('proxyUrl').type === 'password', 'Proxy credentials are not masked')
        assert(
            fixture().form().errors.proxyUrl === t('node-control-addresses.proxy-invalid'),
            'Proxy error is not localized'
        )
        assert(
            t('node-control-addresses.proxy-invalid') !== 'node-control-addresses.proxy-invalid',
            'Proxy translation is missing'
        )
        assert(
            document.body.innerText.includes(t('node-control-addresses.proxy-invalid')),
            'Localized field error is hidden'
        )
        await noCalls()
        return {
            earlyError: true,
            blocked: true,
            focused: true,
            masked: true,
            language: fixture().i18n.language
        }
    },
    async 'invalid-proxy-blur'() {
        await connection()
        await popup()
        await fill('proxyUrl', 'https://proxy.example.test:1080')
        input('proxyUrl').focus()
        input('proxyUrl').blur()
        await until(() => fixture().form().errors.proxyUrl, 'proxy blur validation')
        await noCalls()
        return { blurValidation: true }
    },
    async 'connection-first-error'() {
        await open()
        await click('common.action.next')
        await until(
            () =>
                document.activeElement ===
                document.querySelector('[data-path="create-node-form-name"]'),
            'first connection field focus'
        )
        assert(
            fixture().form().errors.name || input('name').validity.valueMissing,
            'Empty required name has no validation error'
        )
        await noCalls()
        return { nameFirst: true, nativeRequiredOrFormValidation: true }
    },
    async 'duplicate-address-focus'() {
        await connection('2001:0db8::20')
        await click('node-control-addresses.add')
        await fill('controlAddresses.1.address', '[2001:db8::20]')
        await click('common.action.next')
        await until(
            () =>
                document.activeElement ===
                document.querySelector('[data-path="create-node-form-controlAddresses.1.address"]'),
            'indexed duplicate address focus before parent list error'
        )
        assert(
            fixture().form().errors['controlAddresses.1.address'],
            'Duplicate address field error is missing'
        )
        await noCalls()
        return { indexedFocus: true }
    },
    async 'valid-hostname-masked-proxy'() {
        await connection()
        await popup()
        const proxy = 'socks5://fixture:synthetic-only@proxy.example.test:1080'
        await fill('proxyUrl', proxy)
        assert(input('proxyUrl').type === 'password', 'Proxy default type is not password')
        assert(
            !document.body.innerText.includes('synthetic-only'),
            'Synthetic proxy password leaked into visible text'
        )
        await profile()
        await chooseThroughDrawer()
        await click('create-node-modal.widget.create-node')
        await until(() => fixture().mutation.calls.length === 1, 'valid creation')
        assert(fixture().mutation.calls[0].proxyUrl === proxy, 'Valid masked proxy changed')
        assert(
            fixture().mutation.calls[0].controlAddresses[0].address === 'node.example.test',
            'Valid hostname changed'
        )
        fixture().mutation.resolve()
        await until(
            () =>
                fixture().mutation.successes === 1 &&
                !document.querySelector('[data-path="create-node-form-configProfile"]'),
            'actual status step'
        )
        assert(
            fixture().snapshot().calls[0].proxyUrl === '[MASKED]',
            'Fixture snapshot exposed proxy credentials'
        )
        return { actualDrawer: true, submitted: true, statusStep: true, masked: true }
    },
    async 'valid-ipv6-null-proxy'() {
        await connection('[2001:db8::20]')
        await popup()
        await fill('proxyUrl', 'socks5://proxy.example.test:1080')
        await fill('proxyUrl', '')
        assert(
            fixture().form().getValues().proxyUrl === null,
            'Empty proxy was not normalized to null'
        )
        await profile()
        fixture().chooseProfile()
        submit()
        await until(() => fixture().mutation.calls.length === 1, 'IPv6/null creation')
        assert(fixture().mutation.calls[0].proxyUrl === null, 'Null proxy was lost')
        assert(
            fixture().mutation.calls[0].controlAddresses[0].address === '[2001:db8::20]',
            'IPv6 form data was altered'
        )
        return { ipv6: true, nullProxy: true }
    },
    async 'final-hidden-proxy'() {
        await connection()
        await profile()
        fixture().chooseProfile()
        fixture().form().setFieldValue('proxyUrl', 'socks5://proxy.example.test:99999')
        await pause()
        submit()
        await until(
            () =>
                document.activeElement ===
                document.querySelector('[data-path="create-node-form-proxyUrl"]'),
            'final validation routes to proxy'
        )
        assert(fixture().form().errors.proxyUrl, 'Final proxy validation error missing')
        assert(input('name').value === 'Regression node', 'Final validation lost the node name')
        await noCalls()
        return { routedToConnection: true, popupFocused: true, preserved: true }
    },
    async 'final-error-order'() {
        await connection()
        await profile()
        fixture().form().setValues({ name: '', proxyUrl: 'https://proxy.example.test:1080' })
        await pause()
        submit()
        await until(
            () =>
                document.activeElement ===
                document.querySelector('[data-path="create-node-form-name"]'),
            'final validation prioritizes name before proxy and profile'
        )
        assert(
            fixture().form().errors.name && fixture().form().errors.proxyUrl,
            'Full validation dropped connection errors'
        )
        assert(
            Object.keys(fixture().form().errors).some((key) => key.startsWith('configProfile')),
            'Full validation dropped profile error'
        )
        await noCalls()
        return { firstErrorInUiOrder: true, allErrorsRetained: true }
    },
    async 'profile-validation'() {
        await connection()
        await profile()
        submit()
        await until(
            () =>
                document.activeElement ===
                document.querySelector('[data-path="create-node-form-configProfile"]'),
            'profile group focus'
        )
        assert(
            document.querySelector('[data-path="create-node-form-configProfile"]'),
            'Profile error incorrectly routes to connection step'
        )
        assert(
            document.body.innerText.includes(
                t(
                    'show-config-profiles-with-inbounds.feature.choose-a-profile-to-configure-inbounds-for-this-node'
                )
            ),
            'Profile error message is hidden'
        )
        await noCalls()
        return { profileStep: true, groupFocused: true }
    },
    async 'duplicate-submit'() {
        await connection()
        await profile()
        fixture().chooseProfile()
        const create = button('create-node-modal.widget.create-node')
        submit()
        submit()
        create.click()
        create.click()
        await until(() => fixture().mutation.calls.length > 0, 'first mutation')
        await pause(150)
        assert(
            fixture().mutation.calls.length === 1 && fixture().mutation.pending,
            'Repeated submit caused duplicate create requests'
        )
        assert(fixture().mutation.successes === 0, 'Delayed mutation prematurely reported success')
        fixture().mutation.resolve()
        await until(() => fixture().mutation.successes === 1, 'delayed success')
        await pause(350)
        create.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        assert(fixture().mutation.calls.length === 1, 'Completed create was repeated')
        return { oneRequest: true, delayedSuccess: true }
    },
    async 'server-reject-preserves-data'() {
        await connection()
        await popup()
        await fill('proxyUrl', 'socks5://fixture:synthetic-only@proxy.example.test:1080')
        await profile()
        fixture().chooseProfile()
        const before = structuredClone(fixture().form().getValues())
        submit()
        await until(() => fixture().mutation.pending, 'pending server request')
        fixture().mutation.reject('A034')
        await until(
            () =>
                document.activeElement ===
                document.querySelector('[data-path="create-node-form-controlAddresses.0.address"]'),
            'server address error focus'
        )
        assert(
            JSON.stringify(fixture().form().getValues()) === JSON.stringify(before),
            'Server rejection lost entered data'
        )
        assert(
            fixture().mutation.successes === 0 && fixture().mutation.errors === 1,
            'Server rejection produced a success'
        )
        assert(
            fixture().form().errors.controlAddresses,
            'Server rejection did not mark address field'
        )
        await profile()
        submit()
        await until(() => fixture().mutation.calls.length === 2, 'retry after server rejection')
        assert(fixture().mutation.successes === 0, 'Retry falsely reported success')
        return { preserved: true, noSuccess: true, retryAllowed: true }
    },
    async 'compact-addresses'() {
        const root = document.querySelector('[data-testid="editor"]')
        assert(root, 'Open this case with ?editor=1')
        const form = fixture().observedForms.get('editor') as UseFormReturnType<EditorValues>
        const original = structuredClone(form.getValues())
        const rows = () => [...root.querySelectorAll('li')]
        assert(rows().length === 3, 'Unexpected number of compact rows')
        assert(
            [...root.querySelectorAll<HTMLInputElement>('input[type="text"]')].every(
                (element) => element.readOnly
            ),
            'Saved address became editable'
        )
        const inbound = t('node-ip-statuses.inbound')
        assert(
            rows()[1].querySelector(`[aria-label="${inbound}"]`),
            'Normalized IPv6 lost inbound status metadata'
        )
        assert(
            rows()[0].textContent?.includes(t('node-control-addresses.panel')),
            'First enabled address has no Panel badge'
        )
        const up = root.querySelector<HTMLButtonElement>(
            `button[aria-label="${t('node-control-addresses.up', { address: '2001:db8::20' })}"]`
        )!
        up.focus()
        up.click()
        await until(
            () => form.getValues().controlAddresses[0].address === '2001:db8::20',
            'compact reorder'
        )
        assert(
            rows()[0].textContent?.includes(t('node-control-addresses.panel')),
            'Panel badge did not follow priority'
        )
        for (const toggle of [
            ...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        ].filter((element) => element.checked)) {
            toggle.click()
            await pause()
        }
        assert(
            form.getValues().controlAddresses!.length === 3 &&
                form.getValues().controlAddresses!.every((entry: AddressEntry) => !entry.enabled),
            'All-off toggles removed or revived addresses'
        )
        assert(
            root.textContent?.includes(t('node-control-addresses.all-off')),
            'All-off help is hidden'
        )
        await click('node-control-addresses.add', root)
        await until(() => rows().length === 4, 'blank draft')
        assert(
            ![...root.querySelectorAll('button')].some((element) =>
                /discard|delete|remove/i.test(element.getAttribute('aria-label') ?? '')
            ),
            'Draft has a deletion control'
        )
        rows()[3].querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
        await until(() => rows().length === 3, 'switch-off discards blank draft')
        await click('node-control-addresses.add', root)
        await fill('controlAddresses.3.address', 'new.example.test', 'editor')
        rows()[3].querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
        await pause()
        assert(
            form.getValues().controlAddresses.length === 4 &&
                !form.getValues().controlAddresses[3].enabled,
            'Nonempty disabled draft was removed'
        )
        assert(
            form.getValues().address === original.address &&
                JSON.stringify(form.getValues().ips) === JSON.stringify(original.ips),
            'Compact editor changed legacy anchor or IP roles'
        )
        assert(
            form
                .getValues()
                .controlAddresses!.every(
                    (entry: AddressEntry) =>
                        Object.keys(entry).sort().join(',') === 'address,enabled'
                ),
            'UI status metadata leaked into address payload'
        )
        assert(
            root.querySelector('[data-testid="synthetic-rescan"]'),
            'Header action slot is hidden'
        )
        return {
            readonly: true,
            statusMetadata: true,
            reordered: true,
            allOff: true,
            noDelete: true,
            draftSwitches: true
        }
    }
}
export const browserCaseNames = Object.keys(cases)
export async function runBrowserCase(name: string) {
    assert(cases[name], 'Unknown browser regression case')
    return cases[name]()
}

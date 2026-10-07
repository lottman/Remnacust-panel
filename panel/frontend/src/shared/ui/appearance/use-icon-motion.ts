import { useEffect } from 'react'

const surfaces = [
    '[data-icon-motion-target]',
    '.mantine-ThemeIcon-root',
    '.mantine-ActionIcon-icon',
    '.mantine-Button-section',
    '.mantine-NavLink-section',
    '.mantine-Menu-itemSection',
    '.mantine-Tabs-tabSection',
    '.mantine-Badge-section',
    '.mantine-Input-section',
    '.mantine-Accordion-icon',
    '.mantine-Burger-burger'
].join(',')
const controls = 'button,a,[role="button"],.mantine-Menu-item,.mantine-Tabs-tab'
const unavailable =
    ':disabled,[data-disabled],[data-loading],[data-refreshing],[aria-disabled="true"],[aria-busy="true"]'
const excluded = '[data-icon-motion="off"],[data-drag-handle],.monaco-editor,.recharts-wrapper'
type Glyph = HTMLElement | SVGElement
type Target = { owner: Element; icons: Glyph[] }

function targetFor(node: EventTarget | null): Target | null {
    if (!(node instanceof Element) || node.closest(excluded)) return null
    const owner =
        node.closest(controls) ??
        node.closest(surfaces) ??
        node.closest('[data-panel-motion="metric"]') ??
        node.closest('svg:not([data-icon-motion="off"])')
    if (!owner || owner.closest(unavailable)) return null
    const candidates = [
        ...(owner.matches(surfaces) || owner instanceof SVGElement ? [owner] : []),
        ...owner.querySelectorAll(`${surfaces},svg`)
    ].filter((icon): icon is Glyph => icon instanceof HTMLElement || icon instanceof SVGElement)
    const icons = candidates.filter((icon) => {
        if (
            icon.closest(excluded) ||
            candidates.some((other) => other !== icon && other.contains(icon))
        )
            return false
        if (
            !(icon instanceof SVGElement) &&
            !icon.matches('.mantine-Burger-burger,.mantine-ThemeIcon-root') &&
            !icon.querySelector('svg')
        )
            return false
        const rect = icon.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.width <= 80 && rect.height <= 80
    })
    return icons.length ? { owner, icons } : null
}

// Delegation covers lazy pages and portalled menus without a listener per icon.
// Only the glyph moves; the control's hit area and layout keep their position.
export function useIconMotion(reducedMotion: boolean) {
    useEffect(() => {
        if (reducedMotion) return
        const animations = new Map<Glyph, Animation>()
        let pressed: Target | null = null
        let pointerId: number | null = null
        let key: string | null = null
        const mark = (icon: Glyph) => {
            icon.dataset.panelIconMotion = ''
        }
        const spring = (icon: Glyph) => {
            delete icon.dataset.panelIconPressed
            if (!icon.isConnected) return
            animations.get(icon)?.cancel()
            const end = 1
            icon.dataset.panelIconSpring = ''
            const animation = icon.animate(
                [
                    { scale: '1.08', translate: '0 -1px', offset: 0 },
                    { scale: '0.92', translate: '0 2px', offset: 0.28 },
                    { scale: '1.025', translate: '0 -0.5px', offset: 0.62 },
                    { scale: '0.995', translate: '0 0', offset: 0.82 },
                    { scale: String(end), translate: '0 0', offset: 1 }
                ],
                { duration: 360, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' }
            )
            animations.set(icon, animation)
            animation.onfinish = animation.oncancel = () => {
                if (animations.get(icon) === animation) {
                    delete icon.dataset.panelIconSpring
                    animations.delete(icon)
                }
            }
        }
        const release = (bounce: boolean) => {
            const previous = pressed
            pressed = null
            pointerId = null
            key = null
            for (const icon of previous?.icons ?? []) {
                if (bounce) spring(icon)
                else delete icon.dataset.panelIconPressed
            }
        }
        const press = (target: Target | null) => {
            release(false)
            pressed = target
            for (const icon of pressed?.icons ?? []) {
                mark(icon)
                animations.get(icon)?.cancel()
                delete icon.dataset.panelIconSpring
                icon.dataset.panelIconPressed = ''
            }
        }
        const down = (event: PointerEvent) => {
            if (!event.isPrimary || event.button !== 0) return
            press(targetFor(event.target))
            if (pressed) pointerId = event.pointerId
        }
        const up = (event: PointerEvent) => {
            if (event.pointerId === pointerId) release(true)
        }
        const cancel = (event: PointerEvent) => {
            if (event.pointerId === pointerId) release(false)
        }
        const keydown = (event: KeyboardEvent) => {
            if (
                event.repeat ||
                !['Enter', ' '].includes(event.key) ||
                !(event.target instanceof Element)
            )
                return
            if (
                !event.target.matches('button,a,[role="button"]') ||
                (event.key === ' ' && event.target.matches('a'))
            )
                return
            press(targetFor(event.target))
            if (pressed) key = event.key
        }
        const keyup = (event: KeyboardEvent) => {
            if (event.key === key) release(true)
        }
        const reset = () => {
            release(false)
            for (const [icon, animation] of animations) {
                delete icon.dataset.panelIconSpring
                animation.cancel()
            }
            animations.clear()
        }
        document.addEventListener('pointerdown', down, { capture: true, passive: true })
        document.addEventListener('pointerup', up, { capture: true, passive: true })
        document.addEventListener('pointercancel', cancel, { passive: true })
        document.addEventListener('keydown', keydown, true)
        document.addEventListener('keyup', keyup, true)
        document.addEventListener('visibilitychange', reset)
        window.addEventListener('blur', reset)
        return () => {
            reset()
            document.removeEventListener('pointerdown', down, true)
            document.removeEventListener('pointerup', up, true)
            document.removeEventListener('pointercancel', cancel)
            document.removeEventListener('keydown', keydown, true)
            document.removeEventListener('keyup', keyup, true)
            document.removeEventListener('visibilitychange', reset)
            window.removeEventListener('blur', reset)
        }
    }, [reducedMotion])
}

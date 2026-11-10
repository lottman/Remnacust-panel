const controls =
    'button,a,[role="button"],[data-icon-motion-target],.mantine-ThemeIcon-root,.mantine-Menu-item,.mantine-Tabs-tab'
const excluded = '[data-icon-motion="off"],[data-drag-handle],.monaco-editor,.recharts-surface'
const unavailable =
    ':disabled,[data-disabled],[data-loading],[data-refreshing],[aria-disabled="true"],[aria-busy="true"]'
const shapes = 'path,circle,ellipse,line,polyline,polygon,rect'

export function iconPartFrames(stroked: boolean, length: number): Keyframe[] {
    if (stroked && Number.isFinite(length) && length > 0)
        return [
            {
                strokeDasharray: `${length} ${length}`,
                strokeDashoffset: length,
                opacity: 0.35,
                offset: 0
            },
            {
                strokeDasharray: `${length} ${length}`,
                strokeDashoffset: length * 0.2,
                opacity: 1,
                offset: 0.6
            },
            { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0, opacity: 1, offset: 1 }
        ]
    return [
        { opacity: 0.55, filter: 'brightness(1)', offset: 0 },
        { opacity: 1, filter: 'brightness(1.2)', offset: 0.45 },
        { opacity: 0.8, filter: 'brightness(1.05)', offset: 0.7 },
        { opacity: 1, filter: 'brightness(1)', offset: 1 }
    ]
}

export function installIconMotion(document: Document): () => void {
    const view = document.defaultView
    if (!view || typeof Element.prototype.animate !== 'function') return () => {}
    const media = view.matchMedia('(prefers-reduced-motion: reduce)')
    const active = new Map<SVGElement, Animation>()
    const lengths = new WeakMap<SVGGeometryElement, number>()
    const reduced = () =>
        media.matches || document.documentElement.dataset.panelReducedMotion === 'true'
    const reset = () => {
        for (const animation of active.values()) animation.cancel()
        active.clear()
    }
    const ownerFor = (target: EventTarget | null) =>
        target instanceof Element ? (target.closest(controls) ?? target.closest('svg')) : null
    const play = (target: EventTarget | null) => {
        if (reduced() || document.hidden || !(target instanceof Element)) return
        const owner = ownerFor(target)
        if (!owner || owner.closest(unavailable) || target.closest(excluded)) return
        const hit = target.closest('svg')
        const icons = hit
            ? [hit]
            : owner.matches('svg')
              ? [owner]
              : [...owner.querySelectorAll('svg')].slice(0, 3)
        for (const icon of icons) {
            if (!(icon instanceof SVGSVGElement) || icon.closest(excluded)) continue
            const bounds = icon.getBoundingClientRect()
            if (!bounds.width || !bounds.height || bounds.width > 80 || bounds.height > 80) continue
            const parts = [...icon.querySelectorAll(shapes)].slice(0, 12)
            for (const [index, part] of parts.entries()) {
                if (!(part instanceof SVGElement) || part.closest('defs,clipPath,mask')) continue
                const style = view.getComputedStyle(part)
                if (
                    style.visibility === 'hidden' ||
                    style.display === 'none' ||
                    Number(style.opacity) === 0
                )
                    continue
                const stroked = style.stroke !== 'none' && style.strokeDasharray === 'none'
                let length = 0
                if (
                    stroked &&
                    part instanceof SVGGeometryElement &&
                    (part.getAttribute('d')?.length ?? 0) < 16384
                ) {
                    try {
                        length = lengths.get(part) ?? part.getTotalLength()
                    } catch {
                        length = 0
                    }
                    lengths.set(part, length)
                }
                active.get(part)?.cancel()
                if (active.size >= 48) {
                    const oldest = active.entries().next().value
                    if (oldest) {
                        active.delete(oldest[0])
                        oldest[1].cancel()
                    }
                }
                const animation = part.animate(iconPartFrames(stroked, length), {
                    duration: stroked ? 420 : 360,
                    delay: index * 16,
                    easing: 'cubic-bezier(.2,.7,.3,1)'
                })
                active.set(part, animation)
                animation.onfinish = animation.oncancel = () => {
                    if (active.get(part) === animation) active.delete(part)
                }
            }
        }
    }
    const hover = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
        const owner = ownerFor(event.target)
        if (owner && event.relatedTarget instanceof Node && owner.contains(event.relatedTarget))
            return
        play(event.target)
    }
    const activate = (event: PointerEvent) => {
        if (event.isPrimary && event.button === 0) play(event.target)
    }
    const focus = (event: FocusEvent) => play(event.target)
    const key = (event: KeyboardEvent) => {
        if (
            !event.repeat &&
            ['Enter', ' '].includes(event.key) &&
            event.target instanceof Element &&
            event.target.matches('button,a,[role="button"]')
        )
            play(event.target)
    }
    document.addEventListener('pointerover', hover, { passive: true })
    document.addEventListener('pointerup', activate, { passive: true })
    document.addEventListener('focusin', focus)
    document.addEventListener('keydown', key)
    document.addEventListener('visibilitychange', reset)
    view.addEventListener('blur', reset)
    media.addEventListener('change', reset)
    return () => {
        reset()
        document.removeEventListener('pointerover', hover)
        document.removeEventListener('pointerup', activate)
        document.removeEventListener('focusin', focus)
        document.removeEventListener('keydown', key)
        document.removeEventListener('visibilitychange', reset)
        view.removeEventListener('blur', reset)
        media.removeEventListener('change', reset)
    }
}

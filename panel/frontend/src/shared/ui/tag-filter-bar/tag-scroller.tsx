import { UnstyledButton } from '@mantine/core'
import { ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbChevronLeft, TbChevronRight } from 'react-icons/tb'

import { usePanelReducedMotion } from '@shared/ui/appearance/appearance'

import classes from './tag-filter-bar.module.css'

export function TagScroller({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    const reducedMotion = usePanelReducedMotion()
    const id = useId()
    const rootRef = useRef<HTMLDivElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [edges, setEdges] = useState({ overflow: false, start: false, end: false })

    useLayoutEffect(() => {
        const root = rootRef.current
        const viewport = viewportRef.current
        const content = contentRef.current
        if (!root || !viewport || !content) return
        const update = () => {
            const offset = Math.abs(viewport.scrollLeft)
            const max = viewport.scrollWidth - viewport.clientWidth
            const next = {
                overflow: content.getBoundingClientRect().width > root.clientWidth + 1,
                start: offset > 1,
                end: offset < max - 1
            }
            setEdges((current) =>
                current.overflow === next.overflow &&
                current.start === next.start &&
                current.end === next.end
                    ? current
                    : next
            )
        }
        const observer = new ResizeObserver(update)
        observer.observe(root)
        observer.observe(viewport)
        observer.observe(content)
        viewport.addEventListener('scroll', update, { passive: true })
        update()
        return () => {
            observer.disconnect()
            viewport.removeEventListener('scroll', update)
        }
    }, [])

    const scroll = (forward: boolean) => {
        const viewport = viewportRef.current
        if (!viewport) return
        const direction = getComputedStyle(viewport).direction === 'rtl' ? -1 : 1
        viewport.scrollBy({
            left: direction * (forward ? 1 : -1) * Math.max(160, viewport.clientWidth * 0.75),
            behavior: reducedMotion ? 'instant' : 'smooth'
        })
    }

    return (
        <div
            className={classes.scroller}
            ref={rootRef}
            data-tag-filter
            data-overflow={edges.overflow || undefined}
        >
            {edges.overflow && (
                <UnstyledButton
                    className={classes.scrollControl}
                    aria-label={t('design-ui.previous-tags')}
                    aria-controls={id}
                    disabled={!edges.start}
                    onClick={() => scroll(false)}
                >
                    <TbChevronLeft size={18} />
                </UnstyledButton>
            )}
            <div className={classes.viewport} id={id} ref={viewportRef} data-tags-scroll>
                <div className={classes.content} ref={contentRef}>
                    {children}
                </div>
            </div>
            {edges.overflow && (
                <UnstyledButton
                    className={classes.scrollControl}
                    aria-label={t('design-ui.next-tags')}
                    aria-controls={id}
                    disabled={!edges.end}
                    onClick={() => scroll(true)}
                >
                    <TbChevronRight size={18} />
                </UnstyledButton>
            )}
        </div>
    )
}

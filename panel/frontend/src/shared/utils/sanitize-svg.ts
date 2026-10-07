import DOMPurify from 'dompurify'

/** SVG syntax validation alone does not remove scripts or event handlers. */
export function sanitizeSvg(svg: string): string {
    return DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['style', 'foreignObject'],
        FORBID_ATTR: ['style'],
        SANITIZE_NAMED_PROPS: true
    })
}

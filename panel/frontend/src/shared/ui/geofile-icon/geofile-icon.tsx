import type { SVGProps } from 'react'

export function GeofileIcon({
    disabled = false,
    ...props
}: SVGProps<SVGSVGElement> & { disabled?: boolean }) {
    return (
        <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
            <path d="M14 3v6h6" />
            <circle cx="12" cy="14.5" r="4" />
            <path d="M8 14.5h8M12 10.5c-2 2-2 6 0 8m0-8c2 2 2 6 0 8" />
            {disabled && <path d="m3 3 18 18" strokeWidth="2" />}
        </svg>
    )
}

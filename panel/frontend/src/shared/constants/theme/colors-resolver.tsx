import {
    defaultVariantColorsResolver,
    parseThemeColor,
    rgba,
    VariantColorsResolver
} from '@mantine/core'

export const variantColorResolver: VariantColorsResolver = (input) => {
    const defaultResolvedColors = defaultVariantColorsResolver(input)

    if (input.variant === 'soft') {
        const parsed = parseThemeColor({
            color: input.color || input.theme.primaryColor,
            theme: input.theme
        })
        if (!parsed.isThemeColor || !input.theme.colors[parsed.color]) return defaultResolvedColors
        const c1 = input.theme.colors[parsed.color][6]
        const c2 = input.theme.colors[parsed.color][7]
        return {
            background: `linear-gradient(135deg, ${rgba(c1, 0.15)} 0%, ${rgba(c2, 0.1)} 100%)`,
            border: `1px solid ${rgba(c1, 0.18)}`,
            color: `light-dark(var(--mantine-color-${parsed.color}-8), var(--mantine-color-${parsed.color}-4))`,
            hover: rgba(input.theme.colors[parsed.color][4], 0.1)
        }
    }

    return defaultResolvedColors
}

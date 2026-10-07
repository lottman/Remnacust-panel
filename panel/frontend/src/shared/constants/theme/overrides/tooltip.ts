import { Tooltip } from '@mantine/core'

export default {
    Tooltip: Tooltip.extend({
        defaultProps: {
            radius: 'md',
            withArrow: true,
            transitionProps: { transition: 'fade', duration: 120 },
            arrowSize: 4,
            styles: {
                tooltip: {
                    background: 'var(--panel-elevated)',
                    color: 'var(--panel-text)',
                    border: '1px solid var(--panel-border)',
                    maxWidth: 'min(320px, calc(100vw - 32px))',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    lineHeight: 1.5,
                    padding: '8px 12px'
                }
            }
        }
    })
}

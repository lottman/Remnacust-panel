import { Combobox, Menu } from '@mantine/core'

export default {
    Menu: Menu.extend({
        defaultProps: {
            shadow: 'lg',
            withArrow: false,
            radius: 'md',
            transitionProps: {
                transition: 'fade',
                duration: 180,
                timingFunction: 'ease-out'
            },
            styles: {
                dropdown: {
                    backgroundColor: 'var(--panel-elevated)',
                    border: '1px solid var(--panel-border)',
                    boxShadow: 'var(--panel-overlay-shadow)'
                },
                divider: {
                    borderColor: 'var(--panel-border)',
                    margin: '4px 0'
                }
            }
        }
    }),
    Combobox: Combobox.extend({
        defaultProps: {
            transitionProps: { transition: 'fade', duration: 200 }
        }
    })
}

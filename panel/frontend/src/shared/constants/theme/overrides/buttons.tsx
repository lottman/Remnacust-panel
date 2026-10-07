// oxlint-disable
import { ActionIcon, Button, CloseButton, Switch } from '@mantine/core'

export default {
    ActionIcon: ActionIcon.extend({
        defaultProps: {
            radius: 'md',
            variant: 'outline'
        }
    }),
    Button: Button.extend({
        defaultProps: {
            radius: 'md',
            variant: 'light'
        },
        styles: {
            root: {
                transition:
                    'background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 180ms cubic-bezier(0.22, 0.8, 0.24, 1), box-shadow 180ms ease',
                fontWeight: 600
            }
        }
    }),
    CloseButton: CloseButton.extend({
        defaultProps: {
            size: 'lg'
        }
    }),
    Switch: Switch.extend({
        defaultProps: {
            radius: 'md'
        }
    })
}

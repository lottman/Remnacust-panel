import { InputBase, PasswordInput, Select, TextInput } from '@mantine/core'
import { DateTimePicker, TimePicker } from '@mantine/dates'

export default {
    TimePicker: TimePicker.extend({
        styles: {
            fieldsRoot: { overflow: 'visible' },
            fieldsGroup: { height: 'auto' },
            field: {
                height: '1.8em',
                minHeight: '1.8em',
                width: 'calc(2ch + 0.75em)',
                paddingInline: '0.3em',
                lineHeight: 1.5,
                flexShrink: 0
            }
        }
    }),
    InputBase: InputBase.extend({
        defaultProps: {
            radius: 'md'
        }
    }),
    PasswordInput: PasswordInput.extend({
        defaultProps: {
            radius: 'md'
        }
    }),
    TextInput: TextInput.extend({
        defaultProps: {
            radius: 'md'
        }
    }),
    Select: Select.extend({
        defaultProps: {
            radius: 'md'
        }
    }),
    DateTimePicker: DateTimePicker.extend({
        defaultProps: {
            radius: 'md'
        }
    })
}

import { InputBase, PasswordInput, Select, TextInput } from '@mantine/core'
import { DateTimePicker, TimePicker } from '@mantine/dates'

export default {
    TimePicker: TimePicker.extend({
        styles: {
            fieldsRoot: { overflow: 'visible' },
            fieldsGroup: { height: 'auto' },
            field: {
                height: '1.65em',
                minHeight: '1.65em',
                width: '1.65em',
                paddingInline: 0,
                lineHeight: 1,
                flexShrink: 0,
                outline: 'none'
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

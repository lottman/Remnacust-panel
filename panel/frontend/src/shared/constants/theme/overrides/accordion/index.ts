import { Accordion } from '@mantine/core'

import classes from './accordion.module.css'

export default {
    Accordion: Accordion.extend({
        classNames: classes,
        defaultProps: {
            radius: 'md'
        }
    })
}

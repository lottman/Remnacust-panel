import { TbHeartFilled } from 'react-icons/tb'
import { Link } from 'react-router'

import { ROUTES } from '@shared/constants'

import { HeaderControl } from './HeaderControl'
import classes from './SupportControl.module.css'

export function SupportControl({ label }: { label?: string } = {}) {
    return (
        <HeaderControl
            label={label}
            className={classes.support}
            component={Link}
            to={ROUTES.DASHBOARD.SUPPORT}
        >
            <TbHeartFilled />
        </HeaderControl>
    )
}

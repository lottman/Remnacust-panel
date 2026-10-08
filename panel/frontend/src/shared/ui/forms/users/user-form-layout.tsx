import { ReactNode } from 'react'

import styles from './user-form-layout.module.css'

export function UserFormLayout({ children }: { children: ReactNode }) {
    return (
        <div className={styles.container}>
            <div className={styles.columns}>{children}</div>
        </div>
    )
}

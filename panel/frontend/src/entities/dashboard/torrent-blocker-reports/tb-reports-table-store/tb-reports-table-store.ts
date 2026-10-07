import { createMrtTableStore } from '@shared/lib/mrt-table-store'

export const useTbReportsTableStore = createMrtTableStore({
    name: 'x-rmnw-tb-reports-table',
    version: 3,
    defaults: {
        sorting: [{ id: 'createdAt', desc: true }]
    }
})

export const useTbReportsTableStoreActions = () => useTbReportsTableStore((store) => store.actions)

import dayjs from 'dayjs';

export const NOTIFICATION_CONFIGS = {
    INFRA_BILLING_NODE_PAYMENT_IN_7_DAYS: {
        from: () => dayjs().add(7, 'days').startOf('day').toDate(),
        to: () => dayjs().add(7, 'days').endOf('day').toDate(),
    },
    INFRA_BILLING_NODE_PAYMENT_IN_48HRS: {
        from: () => dayjs().add(2, 'days').startOf('day').toDate(),
        to: () => dayjs().add(2, 'days').endOf('day').toDate(),
    },
    INFRA_BILLING_NODE_PAYMENT_IN_24HRS: {
        from: () => dayjs().add(1, 'day').startOf('day').toDate(),
        to: () => dayjs().add(1, 'day').endOf('day').toDate(),
    },
    INFRA_BILLING_NODE_PAYMENT_DUE_TODAY: {
        from: () => dayjs().startOf('day').toDate(),
        to: () => dayjs().endOf('day').toDate(),
    },
    INFRA_BILLING_NODE_PAYMENT_OVERDUE_24HRS: {
        from: () => dayjs().subtract(1, 'day').startOf('day').toDate(),
        to: () => dayjs().subtract(1, 'day').endOf('day').toDate(),
    },
    INFRA_BILLING_NODE_PAYMENT_OVERDUE_48HRS: {
        from: () => dayjs().subtract(2, 'days').startOf('day').toDate(),
        to: () => dayjs().subtract(2, 'days').endOf('day').toDate(),
    },
    INFRA_BILLING_NODE_PAYMENT_OVERDUE_7_DAYS: {
        from: () => dayjs().subtract(7, 'days').startOf('day').toDate(),
        to: () => dayjs().subtract(7, 'days').endOf('day').toDate(),
    },
} as const;

export type TBillingNodeNotificationType = keyof typeof NOTIFICATION_CONFIGS;

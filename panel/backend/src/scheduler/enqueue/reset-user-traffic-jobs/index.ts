import { ResetUserTrafficCalendarDayTask } from './reset-user-traffic-day';
import { ResetUserTrafficCalendarMonthTask } from './reset-user-traffic-month';
import { ResetUserTrafficCalendarMonthRollingTask } from './reset-user-traffic-month-rolling';
import { ResetUserTrafficCalendarWeekTask } from './reset-user-traffic-week';

export const RESET_USER_TRAFFIC_TASKS = [
    ResetUserTrafficCalendarMonthTask,
    ResetUserTrafficCalendarWeekTask,
    ResetUserTrafficCalendarDayTask,
    ResetUserTrafficCalendarMonthRollingTask,
];

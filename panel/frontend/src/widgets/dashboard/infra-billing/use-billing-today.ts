import { useEffect, useState } from 'react'

const DAY_MS = 86_400_000
const utcDay = () => Math.floor(Date.now() / DAY_MS)

// One clock per list/summary, never one timer per node or a new network poll.
export function useBillingToday() {
    const [day, setDay] = useState(utcDay)
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        const update = () => {
            setDay(utcDay())
            clearTimeout(timer)
            timer = setTimeout(update, DAY_MS - (Date.now() % DAY_MS) + 50)
        }
        update()
        window.addEventListener('focus', update)
        document.addEventListener('visibilitychange', update)
        return () => {
            clearTimeout(timer)
            window.removeEventListener('focus', update)
            document.removeEventListener('visibilitychange', update)
        }
    }, [])
    return new Date(day * DAY_MS)
}

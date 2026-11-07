import { useEffect, useState } from 'react'

export function useCurrentTime(intervalMs = 60_000): number {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
        return () => window.clearInterval(timer)
    }, [intervalMs])

    return now
}

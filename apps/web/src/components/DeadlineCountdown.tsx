import { useState, useEffect } from 'react'

interface Props {
  deadlineTime: string   // ISO 8601 string from API
  className?: string
}

function pad(n: number) { return String(n).padStart(2, '0') }

export function DeadlineCountdown({ deadlineTime, className = '' }: Props) {
  const [timeLeft, setTimeLeft] = useState('')
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    let id: ReturnType<typeof setInterval>

    function update() {
      const diff = new Date(deadlineTime).getTime() - Date.now()
      if (diff <= 0) { setIsPast(true); setTimeLeft('DEADLINE PASSED'); clearInterval(id); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}m ${pad(s)}s`)
    }

    update()
    id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadlineTime])

  return (
    <span className={`${isPast ? 'text-game-red' : 'text-game-fire'} font-bold ${className}`}>
      {timeLeft}
    </span>
  )
}

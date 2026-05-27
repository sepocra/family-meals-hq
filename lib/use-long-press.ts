'use client'

import { useCallback, useRef } from 'react'

/** Fire callback after press is held; returns whether the last gesture was a long-press. */
export function useLongPress(onLongPress: () => void, delayMs = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      longPressFiredRef.current = false
      clearTimer()
      timerRef.current = setTimeout(() => {
        longPressFiredRef.current = true
        onLongPress()
      }, delayMs)
    },
    [clearTimer, delayMs, onLongPress]
  )

  const onPointerUp = clearTimer
  const onPointerLeave = clearTimer
  const onPointerCancel = clearTimer

  const consumeLongPress = useCallback(() => {
    const fired = longPressFiredRef.current
    longPressFiredRef.current = false
    return fired
  }, [])

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    consumeLongPress,
  }
}

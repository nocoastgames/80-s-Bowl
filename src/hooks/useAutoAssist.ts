import { useEffect, useRef } from 'react';

/**
 * Auto-Assist: take the shot for the student if the switch is not pressed
 * within `delayMs`.
 *
 * Without this, a student who cannot press reliably simply stalls — the sweep
 * oscillates forever and their turn never ends. With it, the game always makes
 * progress, and because the meters are sweeping continuously the auto-fire
 * lands somewhere legitimate rather than at a fixed "free" value.
 *
 * `resetKey` restarts the countdown; pass whatever identifies the current
 * stage (play state, plus a counter bumped on every real switch press).
 */
export function useAutoAssist(
  active: boolean,
  delayMs: number,
  onFire: () => void,
  resetKey: unknown,
  onCountdown?: (remainingMs: number) => void
) {
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;
  const onCountdownRef = useRef(onCountdown);
  onCountdownRef.current = onCountdown;

  useEffect(() => {
    if (!active || delayMs <= 0) {
      onCountdownRef.current?.(0);
      return;
    }

    const startedAt = performance.now();
    let raf: number;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const remaining = delayMs - elapsed;
      if (remaining <= 0) {
        onCountdownRef.current?.(0);
        onFireRef.current();
        return;
      }
      onCountdownRef.current?.(remaining);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      onCountdownRef.current?.(0);
    };
  }, [active, delayMs, resetKey]);
}

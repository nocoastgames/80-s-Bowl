import { useEffect, useRef } from 'react';

export interface SwitchOptions {
  enabled?: boolean;
  /**
   * Ignore further activations for this long after one registers.
   *
   * This matters more than it looks: many switch interfaces are configured to
   * send a keypress *and* a mouse click for a single physical press, and some
   * students press repeatedly or bounce off the switch. Without a cooldown a
   * single press consumed two game stages at once (locking spin and aim
   * together), which made the game feel broken rather than difficult.
   */
  cooldownMs?: number;
  /**
   * Require the switch to be held this long before it counts. Filters out
   * brief accidental contact from tremor or a resting hand. 0 = fire instantly.
   */
  holdMs?: number;
  /** Accept any key, for switch boxes mapped to something other than Space/Enter. */
  acceptAnyKey?: boolean;
  /** Called each frame while a hold is in progress, with 0..1 progress. */
  onHoldProgress?: (progress: number) => void;
}

const SWITCH_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);

/** Keys that drive the app's own UI and must never double as the switch. */
const RESERVED_KEYS = new Set([
  'Escape', 'Tab', 'F5', 'F11', 'F12',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
  'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
  'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
]);

function isInteractive(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('button, input, select, textarea, a, [role="button"]');
}

export function useSingleSwitch(onSwitch: () => void, options: SwitchOptions | boolean = true) {
  const opts: SwitchOptions = typeof options === 'boolean' ? { enabled: options } : options;
  const {
    enabled = true,
    cooldownMs = 400,
    holdMs = 0,
    acceptAnyKey = false,
    onHoldProgress,
  } = opts;

  // Keep the callback in a ref so the listeners are attached once per settings
  // change rather than on every render. The overlay re-renders often, and
  // re-subscribing window listeners at that rate is pure waste.
  const onSwitchRef = useRef(onSwitch);
  onSwitchRef.current = onSwitch;
  const onHoldProgressRef = useRef(onHoldProgress);
  onHoldProgressRef.current = onHoldProgress;

  const lastFiredAt = useRef(0);
  const holdTimer = useRef<number | undefined>(undefined);
  const holdRaf = useRef<number | undefined>(undefined);
  const holdStartedAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const cancelHold = () => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = undefined;
      }
      if (holdRaf.current) {
        cancelAnimationFrame(holdRaf.current);
        holdRaf.current = undefined;
      }
      holdStartedAt.current = 0;
      onHoldProgressRef.current?.(0);
    };

    const fire = () => {
      const now = performance.now();
      if (now - lastFiredAt.current < cooldownMs) return;
      lastFiredAt.current = now;
      cancelHold();
      onSwitchRef.current();
    };

    const beginActivation = () => {
      // Already counting down this press, or still inside the cooldown.
      if (holdStartedAt.current) return;
      if (performance.now() - lastFiredAt.current < cooldownMs) return;

      if (holdMs <= 0) {
        fire();
        return;
      }

      holdStartedAt.current = performance.now();
      holdTimer.current = window.setTimeout(fire, holdMs);

      const tick = () => {
        if (!holdStartedAt.current) return;
        const progress = Math.min(1, (performance.now() - holdStartedAt.current) / holdMs);
        onHoldProgressRef.current?.(progress);
        if (progress < 1) holdRaf.current = requestAnimationFrame(tick);
      };
      holdRaf.current = requestAnimationFrame(tick);
    };

    const isSwitchKey = (e: KeyboardEvent) => {
      if (RESERVED_KEYS.has(e.code)) return false;
      if (acceptAnyKey) return e.key !== 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey;
      return SWITCH_KEYS.has(e.code);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Auto-repeat from a held key must not machine-gun the game.
      if (e.repeat) return;
      if (!isSwitchKey(e)) return;
      if (isInteractive(e.target)) return;
      e.preventDefault();
      beginActivation();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isSwitchKey(e)) return;
      cancelHold();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (isInteractive(e.target)) return;
      e.preventDefault();
      beginActivation();
    };

    const handlePointerUp = () => cancelHold();

    // A switch interface sending both a key and a click would otherwise leave a
    // dangling hold when only one of the two "up" events arrives.
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', cancelHold);

    return () => {
      cancelHold();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', cancelHold);
    };
  }, [enabled, cooldownMs, holdMs, acceptAnyKey]);
}

/**
 * Timings and trigger for the pin clear / reset sequence.
 *
 * Like lib/sweep.ts, this deliberately sits outside React and the store: the
 * sweeper bar moves every frame, and routing that through state would
 * re-render the whole overlay sixty times a second during an animation that
 * already runs alongside the physics.
 */
export const rackAnim = {
  /** performance.now() when the sweeper bar started its pass; 0 = idle. */
  sweepStartedAt: 0,
};

export function triggerSweep() {
  rackAnim.sweepStartedAt = performance.now();
}

/** A single pin collapsing into a bar of light. */
export const DEREZ_MS = 320;
/** A pin beaming back in. */
export const MATERIALIZE_MS = 420;
/** Gap between consecutive pins derezzing, so the rack goes out as a wave. */
export const DEREZ_STAGGER_MS = 18;
/** Gap between consecutive pins rematerialising. */
export const MATERIALIZE_STAGGER_MS = 26;
/** How long the sweeper bar takes to cross the deck. */
export const SWEEP_MS = 650;

/** Deck is clear and the fresh rack can start beaming in. */
export const RACK_CLEAR_MS = DEREZ_MS + DEREZ_STAGGER_MS * 10;
/** Whole clear-and-reset cycle, start to finish. */
export const RACK_RESET_MS =
  RACK_CLEAR_MS + MATERIALIZE_MS + MATERIALIZE_STAGGER_MS * 10;

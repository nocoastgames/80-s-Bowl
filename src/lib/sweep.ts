/**
 * Live sweep values for the spin / aim / power meters.
 *
 * These change every animation frame. Keeping them in a plain module object
 * instead of React state or the zustand store means the sweep can run at 60fps
 * without re-rendering the overlay (and its scorecard) on every tick — which
 * matters a lot on classroom Chromebooks that are already busy with physics.
 *
 * The UI mutates DOM styles directly from its RAF loop; the 3D scene reads
 * these values inside useFrame. Values are only committed to the store when
 * the player locks them in with the switch.
 */
export const sweep = {
  /** -1 .. 1, left/right spin applied to the ball */
  spin: 0,
  /** radians, roughly -0.2 .. 0.2 */
  aim: 0,
  /** 0 .. 100 */
  power: 0,
};

export function resetSweep() {
  sweep.spin = 0;
  sweep.aim = 0;
  sweep.power = 0;
}

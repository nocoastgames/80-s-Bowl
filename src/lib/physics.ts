/**
 * Physics materials and the contact pairs between them.
 *
 * cannon-es does not use a body's own friction/restitution when two bodies
 * collide. It looks up a ContactMaterial registered for that *pair* of
 * materials, and falls back to the world's defaultContactMaterial when it
 * can't find one. Nothing here registered any pairs, so every collision in the
 * game — ball on bumper, ball on pin, pin on pin — silently used the world
 * default of restitution 0.2. The bumpers never bounced and the pins' randomised
 * restitution did nothing.
 *
 * Bodies reference these by name; the pairs below are registered once in Scene.
 */
export const MAT = {
  ball: 'ball',
  lane: 'lane',
  gutter: 'gutter',
  bumper: 'bumper',
  pin: 'pin',
  wall: 'wall',
} as const;

export interface ContactPair {
  a: string;
  b: string;
  friction: number;
  restitution: number;
  /** Higher is a firmer, less spongy contact. */
  contactEquationStiffness?: number;
  contactEquationRelaxation?: number;
}

export const CONTACT_PAIRS: ContactPair[] = [
  // The ball should roll down the lane, not bounce along it.
  { a: MAT.ball, b: MAT.lane, friction: 0.06, restitution: 0.03 },

  // The headline fix. A bumper is an inflated cushion: it throws the ball back
  // rather than letting it lean on the rail. Near-zero friction stops the ball
  // being dragged along the face, and a high restitution gives a real kick.
  {
    a: MAT.ball,
    b: MAT.bumper,
    friction: 0.005,
    restitution: 0.92,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 2,
  },

  // Gutters are slick and dead — once you're in, you ride it out.
  { a: MAT.ball, b: MAT.gutter, friction: 0.02, restitution: 0.02 },

  // Ball into pins: enough bite to carry them, not so much that the ball stops.
  { a: MAT.ball, b: MAT.pin, friction: 0.1, restitution: 0.4 },

  // Pin on pin is where good pin action comes from — this is the chain
  // reaction that takes out the back row.
  { a: MAT.pin, b: MAT.pin, friction: 0.08, restitution: 0.55 },

  // Pins tumbling and skidding on the deck.
  { a: MAT.pin, b: MAT.lane, friction: 0.14, restitution: 0.3 },
  { a: MAT.pin, b: MAT.gutter, friction: 0.1, restitution: 0.2 },
  { a: MAT.pin, b: MAT.bumper, friction: 0.05, restitution: 0.6 },

  // Backstop and side walls absorb rather than rebound, so nothing pings back
  // into the pin deck after the roll is over.
  { a: MAT.ball, b: MAT.wall, friction: 0.2, restitution: 0.05 },
  { a: MAT.pin, b: MAT.wall, friction: 0.2, restitution: 0.15 },
];

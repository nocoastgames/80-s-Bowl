import { useSphere } from '@react-three/cannon';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useStore } from '../../store';
import { audioEngine } from '../../lib/audio';
import { LANE_HALF_WIDTH, LANE_LENGTH } from './Lane';
import { MAT } from '../../lib/physics';

export interface BallRef {
  reset: () => void;
  roll: (angle: number, power: number) => void;
  getPosition: () => [number, number, number];
  getSpeed: () => number;
}

const START_POS: [number, number, number] = [0, 0.3, 9];
/** Distance from the foul line to the head pin, used to ramp the hook in. */
const LANE_TRAVEL = START_POS[2] + LANE_LENGTH / 2;

export const Ball = forwardRef<BallRef, {}>((_, ref) => {
  const [ballRef, api] = useSphere(() => ({
    mass: 12, // Heavier ball to match larger size
    args: [0.25], // Larger radius
    position: START_POS,
    material: MAT.ball,
    allowSleep: true,
  }));

  const pos = useRef<[number, number, number]>(START_POS);
  const vel = useRef<[number, number, number]>([0, 0, 0]);
  api.position.subscribe((p) => (pos.current = p));
  api.velocity.subscribe((v) => (vel.current = v));

  useFrame(() => {
    const state = useStore.getState();
    if (state.playState === 'spin' || state.playState === 'aiming' || state.playState === 'power') {
      api.position.set(0, 0.3, 9);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
    } else if (state.playState === 'rolling') {
      const spin = state.spinAmount;
      if (Math.abs(spin) <= 0.01) return;

      const [x, , z] = pos.current;

      // The other half of why the ball used to ride the bumper: this force was
      // applied at full strength for the entire roll, so a ball that bounced
      // off was immediately shoved back into the rail. Skip it while the ball
      // is already at the edge and the spin points further that way.
      const atEdge = Math.abs(x) > LANE_HALF_WIDTH - 0.3;
      if (atEdge && Math.sign(x) === Math.sign(spin)) return;

      // Ramp the hook in over the length of the lane, the way a real ball
      // skids first and bites later, instead of curving from the foul line.
      const travelled = (START_POS[2] - z) / LANE_TRAVEL;
      const hook = Math.min(1, Math.max(0, travelled) * 1.7);

      api.applyForce([spin * 28 * hook, 0, 0], [0, 0, 0]);
    }
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      api.position.set(...START_POS);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      api.wakeUp();
    },
    roll: (angle: number, power: number) => {
      // power is 0 to 100
      const force = 5 + (power / 100) * 15; // Base force + power multiplier

      // Calculate velocity vector based on angle
      // Angle is in radians, 0 is straight down the lane (-z)
      // We negate Math.sin(angle) so that a positive angle (arrow pointing left) results in negative X velocity (moving left)
      const vx = -Math.sin(angle) * force;
      const vz = -Math.cos(angle) * force;

      api.wakeUp();
      api.velocity.set(vx, 0, vz);
      // Add some forward spin
      api.angularVelocity.set(-force / 2, 0, 0);

      audioEngine.startRoll();
    },
    getPosition: () => pos.current,
    getSpeed: () => Math.hypot(vel.current[0], vel.current[1], vel.current[2]),
  }));

  return (
    <mesh ref={ballRef as any} castShadow receiveShadow>
      <sphereGeometry args={[0.25, 32, 32]} />
      <meshStandardMaterial
        color="#1a5f7a"
        emissive="#00f2ff"
        emissiveIntensity={0.25}
        roughness={0.2}
        metalness={0.8}
      />
    </mesh>
  );
});

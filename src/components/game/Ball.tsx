import { useSphere } from '@react-three/cannon';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Mesh, Vector3 } from 'three';
import { useStore } from '../../store';
import { audioEngine } from '../../lib/audio';

export interface BallRef {
  reset: () => void;
  roll: (angle: number, power: number) => void;
  getPosition: () => [number, number, number];
}

const START_POS: [number, number, number] = [0, 0.3, 9];

export const Ball = forwardRef<BallRef, {}>((_, ref) => {
  const [ballRef, api] = useSphere(() => ({
    mass: 12, // Heavier ball to match larger size
    args: [0.25], // Larger radius
    position: START_POS,
    material: { friction: 0.1, restitution: 0.2 },
    allowSleep: true,
  }));

  const pos = useRef<[number, number, number]>(START_POS);
  api.position.subscribe((p) => (pos.current = p));

  useFrame(() => {
    const state = useStore.getState();
    if (state.playState === 'spin' || state.playState === 'aiming' || state.playState === 'power') {
      api.position.set(0, 0.3, 9);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
    } else if (state.playState === 'rolling') {
      // Add heavy hook/spin force
      if (Math.abs(state.spinAmount) > 0.01) {
        // We supply an impulse force, multiplier adjusted for pronounced but not excessive spin effect
        api.applyForce([state.spinAmount * 25, 0, 0], [0, 0, 0]);
      }
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
  }));

  return (
    <mesh ref={ballRef as any} castShadow receiveShadow>
      <sphereGeometry args={[0.25, 32, 32]} />
      <meshStandardMaterial color="#1a5f7a" roughness={0.2} metalness={0.8} />
    </mesh>
  );
});

import { useCylinder } from '@react-three/cannon';
import { forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MeshStandardMaterial, Vector3, Euler } from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../../store';
import { MAT } from '../../lib/physics';

interface PinProps {
  position: [number, number, number];
  id: number;
}

export interface PinRef {
  reset: () => void;
  hide: () => void;
  getPosition: () => [number, number, number];
  getRotation: () => [number, number, number];
  getSpeed: () => number;
  isFallen: () => boolean;
  /** Has started to go over — used to sound the hit the moment it happens. */
  isTipping: () => boolean;
}

/** Tilt past this angle (radians) and the pin counts as knocked down. */
export const FALLEN_ANGLE = 1.0;
/** Smaller tilt, used to notice a pin has *started* to go over (for the sfx). */
export const TIPPING_ANGLE = 0.3;

const UP = new Vector3(0, 1, 0);

/** Shared scratch objects — avoids allocating a Vector3/Euler every frame. */
const scratchEuler = new Euler();
const scratchVec = new Vector3();

export function tiltAngle(rot: [number, number, number]): number {
  scratchEuler.set(rot[0], rot[1], rot[2]);
  scratchVec.set(0, 1, 0).applyEuler(scratchEuler);
  return scratchVec.angleTo(UP);
}

export const Pin = forwardRef<PinRef, PinProps>(({ position, id }, ref) => {
  // Slight variation per pin so a rack never falls the same way twice.
  //
  // Friction and restitution used to be randomised here too, but a body's own
  // values are never consulted during a collision — cannon-es reads them from
  // the ContactMaterial for the pair (see lib/physics.ts), so those two did
  // nothing. Mass and damping are genuine per-body properties and still vary.
  const physicsProps = useMemo(() => {
    return {
      mass: 0.35 + (Math.random() * 0.1), // 0.35 - 0.45
      linearDamping: 0.02 + (Math.random() * 0.06), // 0.02 - 0.08
    };
  }, []);

  const colors = useMemo(() => {
    let rowIndex = 0;
    if (id >= 1 && id <= 2) rowIndex = 1;
    else if (id >= 3 && id <= 5) rowIndex = 2;
    else if (id >= 6 && id <= 9) rowIndex = 3;

    const ROW_COLORS = [
      { main: '#ff00ff', blob: '#00ffff' }, // Magenta with Cyan blobs
      { main: '#00ffff', blob: '#ff00ff' }, // Cyan with Magenta blobs
      { main: '#00ff00', blob: '#ffff00' }, // Green with Yellow blobs
      { main: '#ff0000', blob: '#ff8800' }, // Red with Orange blobs
    ];

    return ROW_COLORS[rowIndex] || ROW_COLORS[0];
  }, [id]);

  const [pinRef, api] = useCylinder(() => ({
    mass: physicsProps.mass, // Lighter so they fly faster when hit
    args: [0.12, 0.12, 0.9, 16], // Slightly wider physics base to catch more collisions
    position,
    material: MAT.pin,
    linearDamping: physicsProps.linearDamping, // Less air resistance, fly further
    angularDamping: 0.05, // Spin more freely
    allowSleep: true,
    sleepSpeedLimit: 0.5, // Sleep faster when moving slowly
    sleepTimeLimit: 0.1, // Require less time to fall asleep
  }));

  const pos = useRef<[number, number, number]>(position);
  const rot = useRef<[number, number, number]>([0, 0, 0]);
  const vel = useRef<[number, number, number]>([0, 0, 0]);
  const glowMaterialRef = useRef<MeshStandardMaterial>(null);
  const blobsRef = useRef<THREE.Group>(null);

  // Random phase offsets for blobs based on pin
  const blobOffsets = useMemo(() => {
    return [
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    ];
  }, []);

  // Track position, rotation and speed for scoring and settle detection
  api.position.subscribe((p) => (pos.current = p));
  api.rotation.subscribe((r) => (rot.current = r));
  api.velocity.subscribe((v) => (vel.current = v));

  // Force sleep on mount so they don't wobble
  useEffect(() => {
    const timer = setTimeout(() => {
      api.sleep();
    }, 100);
    return () => clearTimeout(timer);
  }, [api]);

  useFrame((state) => {
    if (!glowMaterialRef.current) return;

    const isFallen = tiltAngle(rot.current) > FALLEN_ANGLE || pos.current[1] < 0;
    const reduceMotion = useStore.getState().reduceMotion;

    if (reduceMotion) {
      // Steady glow, no pulsing and no drifting blobs.
      glowMaterialRef.current.emissiveIntensity = isFallen ? 0 : 3.0;
      glowMaterialRef.current.opacity = isFallen ? 0.2 : 0.6;
      return;
    }

    const t = state.clock.elapsedTime;
    const pulsing = Math.sin(t * 3) * 0.8; // pulsing glow effect
    glowMaterialRef.current.emissiveIntensity = isFallen ? 0 : 3.0 + pulsing;
    glowMaterialRef.current.opacity = isFallen ? 0.2 : 0.6;

    if (!isFallen && blobsRef.current) {
      blobsRef.current.children.forEach((blob, i) => {
        const offset = blobOffsets[i];
        const y = Math.sin(t * 1.5 + offset) * 0.08;
        const x = Math.sin(t * 2.1 + offset * 2) * 0.01;
        const z = Math.cos(t * 1.8 + offset * 3) * 0.01;
        blob.position.set(x, y, z);

        // Blob pulsing effect
        const scale = 1 + Math.sin(t * 3 + offset) * 0.3;
        blob.scale.set(scale, scale, scale);
      });
    }
  });

  useImperativeHandle(ref, () => ({
    reset: () => {
      api.position.set(...position);
      api.rotation.set(0, 0, 0);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);

      // Briefly wake to register position, then sleep to prevent wobble
      api.wakeUp();
      setTimeout(() => api.sleep(), 50);
    },
    hide: () => {
      api.position.set(0, -10, 0);
      api.velocity.set(0, 0, 0);
      api.angularVelocity.set(0, 0, 0);
      api.sleep();
    },
    getPosition: () => pos.current,
    getRotation: () => rot.current,
    getSpeed: () => Math.hypot(vel.current[0], vel.current[1], vel.current[2]),
    isFallen: () => tiltAngle(rot.current) > FALLEN_ANGLE || pos.current[1] < 0,
    isTipping: () => tiltAngle(rot.current) > TIPPING_ANGLE || pos.current[1] < 0,
  }));

  return (
    <mesh ref={pinRef as any} castShadow receiveShadow>
      {/* Lava Lamp Visuals - Scaled up */}
      <group position={[0, -0.45, 0]} scale={[2.25, 2.25, 2.25]}>
        {/* Base */}
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.1, 16]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Glowing Body */}
        <group position={[0, 0.2, 0]}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.06, 0.2, 16]} />
            <meshStandardMaterial
              ref={glowMaterialRef}
              color={colors.main}
              emissive={colors.main}
              emissiveIntensity={0.8}
              transparent
              opacity={0.5}
            />
          </mesh>
          <group ref={blobsRef}>
            {[...Array(3)].map((_, i) => (
              <mesh key={i} position={[0, 0, 0]}>
                <sphereGeometry args={[0.012, 16, 16]} />
                <meshStandardMaterial color={colors.blob} emissive={colors.blob} emissiveIntensity={3.5} />
              </mesh>
            ))}
          </group>
        </group>
        {/* Top Cap */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.02, 0.03, 0.1, 16]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    </mesh>
  );
});

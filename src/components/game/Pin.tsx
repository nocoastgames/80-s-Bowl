import { useCylinder } from '@react-three/cannon';
import { forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MeshStandardMaterial, Vector3, Euler } from 'three';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../../store';
import { MAT } from '../../lib/physics';
import { DEREZ_MS, MATERIALIZE_MS } from '../../lib/rackAnim';

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
  /** Has this pin stopped moving *and* stopped rotating? */
  isSettled: () => boolean;
  isFallen: () => boolean;
  /** Has started to go over — used to sound the hit the moment it happens. */
  isTipping: () => boolean;
  /** Collapse into a bar of light and wink out. Visual only. */
  derez: (delayMs?: number) => void;
  /** Beam back in from nothing. Visual only; call after reset(). */
  materialize: (delayMs?: number) => void;
}

/** Base scale of the pin's visual group. */
const PIN_SCALE = 2.25;

/** Overshoot easing, so a pin snaps in rather than easing politely. */
function easeOutBack(p: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
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
    // Sleep gently. The old 0.5 / 0.1s was aggressive enough to put a pin to
    // sleep while it was still slowly toppling, freezing it at an angle below
    // the fallen threshold so it never counted and never finished falling.
    sleepSpeedLimit: 0.12,
    sleepTimeLimit: 0.5,
  }));

  const pos = useRef<[number, number, number]>(position);
  const rot = useRef<[number, number, number]>([0, 0, 0]);
  const vel = useRef<[number, number, number]>([0, 0, 0]);
  const angVel = useRef<[number, number, number]>([0, 0, 0]);
  const glowMaterialRef = useRef<MeshStandardMaterial>(null);
  const blobsRef = useRef<THREE.Group>(null);
  const visualRef = useRef<THREE.Group>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const beamMatRef = useRef<any>(null);

  /** Rack clear/reset animation state. `at` is when this pin's turn starts. */
  const anim = useRef<{ mode: 'none' | 'derez' | 'materialize'; at: number }>({
    mode: 'none',
    at: 0,
  });

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
  api.angularVelocity.subscribe((v) => (angVel.current = v));

  // Force sleep on mount so they don't wobble
  useEffect(() => {
    const timer = setTimeout(() => {
      api.sleep();
    }, 100);
    return () => clearTimeout(timer);
  }, [api]);

  useFrame((state) => {
    // --- Rack clear / reset animation -------------------------------------
    // Runs before the glow logic so its flash can be layered on top.
    let animBoost = 0;
    const a = anim.current;
    const vis = visualRef.current;

    if (a.mode !== 'none' && vis) {
      const elapsed = performance.now() - a.at;
      const dur = a.mode === 'derez' ? DEREZ_MS : MATERIALIZE_MS;
      const p = Math.min(1, Math.max(0, elapsed / dur));

      if (elapsed < 0) {
        // Waiting out this pin's stagger. A pin due to materialise stays
        // hidden until its moment; one due to derez keeps standing.
        if (a.mode === 'materialize') vis.visible = false;
      } else if (a.mode === 'derez') {
        // Squash flat and spread outward, like the pin is being flattened
        // into a disc of light.
        vis.visible = true;
        vis.scale.set(PIN_SCALE * (1 + p * 0.9), PIN_SCALE * (1 - p), PIN_SCALE * (1 + p * 0.9));
        animBoost = p * 16;
        if (beamMatRef.current && beamRef.current) {
          beamRef.current.visible = true;
          beamMatRef.current.opacity = Math.sin(Math.PI * p) * 0.3;
        }
        if (p >= 1) {
          vis.visible = false;
          if (beamRef.current) beamRef.current.visible = false;
          a.mode = 'none';
        }
      } else {
        // Reverse: a flat disc of light snaps up into a pin.
        vis.visible = true;
        const s = easeOutBack(p);
        vis.scale.set(
          PIN_SCALE * (1 + (1 - p) * 0.9),
          PIN_SCALE * Math.max(0.001, s),
          PIN_SCALE * (1 + (1 - p) * 0.9)
        );
        animBoost = (1 - p) * 16;
        if (beamMatRef.current && beamRef.current) {
          beamRef.current.visible = true;
          beamMatRef.current.opacity = (1 - p) * 0.35;
        }
        if (p >= 1) {
          vis.scale.setScalar(PIN_SCALE);
          if (beamRef.current) beamRef.current.visible = false;
          a.mode = 'none';
        }
      }
    }

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
    glowMaterialRef.current.emissiveIntensity = (isFallen ? 0 : 3.0 + pulsing) + animBoost;
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

      // Clear any animation left mid-flight (e.g. the pause menu's Reset Pins
      // landing in the middle of a sweep) and restore the pin's normal look.
      anim.current.mode = 'none';
      if (visualRef.current) {
        visualRef.current.visible = true;
        visualRef.current.scale.setScalar(PIN_SCALE);
      }
      if (beamRef.current) beamRef.current.visible = false;
    },
    derez: (delayMs = 0) => {
      // Already off the deck, or motion is reduced: skip straight to the end
      // state rather than animating something nobody asked to see.
      if (pos.current[1] < -5 || useStore.getState().reduceMotion) {
        anim.current.mode = 'none';
        if (visualRef.current) visualRef.current.visible = false;
        if (beamRef.current) beamRef.current.visible = false;
        return;
      }
      anim.current = { mode: 'derez', at: performance.now() + delayMs };
    },
    materialize: (delayMs = 0) => {
      if (useStore.getState().reduceMotion) {
        anim.current.mode = 'none';
        if (visualRef.current) {
          visualRef.current.visible = true;
          visualRef.current.scale.setScalar(PIN_SCALE);
        }
        return;
      }
      anim.current = { mode: 'materialize', at: performance.now() + delayMs };
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
    isSettled: () => {
      // Angular velocity is the important half. A pin going over rotates
      // almost in place, so a linear-speed check alone reports it as still
      // and the rack gets counted while pins are mid-fall.
      const linear = Math.hypot(vel.current[0], vel.current[1], vel.current[2]);
      const angular = Math.hypot(angVel.current[0], angVel.current[1], angVel.current[2]);
      return linear < 0.12 && angular < 0.3;
    },
    isFallen: () => tiltAngle(rot.current) > FALLEN_ANGLE || pos.current[1] < 0,
    isTipping: () => tiltAngle(rot.current) > TIPPING_ANGLE || pos.current[1] < 0,
  }));

  return (
    <mesh ref={pinRef as any} castShadow receiveShadow>
      {/* Column of light the pin travels in and out on. Sits outside the
          scaled visual group so it keeps its full height while the pin
          itself is collapsing. */}
      <mesh ref={beamRef} position={[0, 0.35, 0]} visible={false}>
        <cylinderGeometry args={[0.13, 0.13, 1.5, 10, 1, true]} />
        <meshBasicMaterial
          ref={beamMatRef}
          color={colors.blob}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Lava Lamp Visuals - Scaled up */}
      <group ref={visualRef} position={[0, -0.45, 0]} scale={[PIN_SCALE, PIN_SCALE, PIN_SCALE]}>
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

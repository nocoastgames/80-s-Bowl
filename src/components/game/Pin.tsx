import { useCylinder } from '@react-three/cannon';
import { forwardRef, useImperativeHandle, useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MeshStandardMaterial, Vector3, Euler } from 'three';
import { useFrame } from '@react-three/fiber';

interface PinProps {
  position: [number, number, number];
  id: number;
}

export interface PinRef {
  reset: () => void;
  hide: () => void;
  getPosition: () => [number, number, number];
  getRotation: () => [number, number, number];
}

export const Pin = forwardRef<PinRef, PinProps>(({ position, id }, ref) => {
  const [pinRef, api] = useCylinder(() => ({
    mass: 0.4, // Lighter so they fly faster when hit
    args: [0.12, 0.12, 0.9, 16], // Slightly wider physics base to catch more collisions
    position,
    material: { friction: 0.1, restitution: 1.0 }, // Very bouncy, less friction
    linearDamping: 0.05, // Less air resistance, fly further
    angularDamping: 0.05, // Spin more freely
    allowSleep: true,
    sleepSpeedLimit: 0.5, // Sleep faster when moving slowly
    sleepTimeLimit: 0.1, // Require less time to fall asleep
  }));

  const pos = useRef<[number, number, number]>(position);
  const rot = useRef<[number, number, number]>([0, 0, 0]);
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

  // Track position and rotation for scoring
  api.position.subscribe((p) => (pos.current = p));
  api.rotation.subscribe((r) => (rot.current = r));

  // Force sleep on mount so they don't wobble
  useEffect(() => {
    const timer = setTimeout(() => {
      api.sleep();
    }, 100);
    return () => clearTimeout(timer);
  }, [api]);

  useFrame((state) => {
    if (glowMaterialRef.current) {
      const euler = new Euler(rot.current[0], rot.current[1], rot.current[2]);
      const currentUp = new Vector3(0, 1, 0).applyEuler(euler);
      const angle = currentUp.angleTo(new Vector3(0, 1, 0));
      const isFallen = angle > 1.0 || pos.current[1] < 0;
      
      glowMaterialRef.current.emissiveIntensity = isFallen ? 0 : 0.8;
      glowMaterialRef.current.opacity = isFallen ? 0.3 : 0.5; // lower opacity to see inside

      if (!isFallen && blobsRef.current) {
        const t = state.clock.elapsedTime;
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
              color="#ff00ff" 
              emissive="#ff00ff" 
              emissiveIntensity={0.8} 
              transparent 
              opacity={0.5} 
            />
          </mesh>
          <group ref={blobsRef}>
            {[...Array(3)].map((_, i) => (
              <mesh key={i} position={[0, 0, 0]}>
                <sphereGeometry args={[0.012, 16, 16]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={1.5} />
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

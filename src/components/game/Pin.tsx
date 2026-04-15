import { useCylinder } from '@react-three/cannon';
import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { Mesh, MeshStandardMaterial, Vector3, Euler } from 'three';
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
    mass: 0.7, // Lighter so they fly faster when hit
    args: [0.1, 0.1, 0.9, 16], // Wider and taller physics base
    position,
    material: { friction: 0.2, restitution: 0.9 }, // Much bouncier, less friction
    linearDamping: 0.1, // Less air resistance, fly further
    angularDamping: 0.1, // Spin more freely
    allowSleep: true,
    sleepSpeedLimit: 0.5, // Sleep faster when moving slowly
    sleepTimeLimit: 0.1, // Require less time to fall asleep
  }));

  const pos = useRef<[number, number, number]>(position);
  const rot = useRef<[number, number, number]>([0, 0, 0]);
  const glowMaterialRef = useRef<MeshStandardMaterial>(null);

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

  useFrame(() => {
    if (glowMaterialRef.current) {
      const euler = new Euler(rot.current[0], rot.current[1], rot.current[2]);
      const currentUp = new Vector3(0, 1, 0).applyEuler(euler);
      const angle = currentUp.angleTo(new Vector3(0, 1, 0));
      const isFallen = angle > 1.0 || pos.current[1] < 0;
      
      glowMaterialRef.current.emissiveIntensity = isFallen ? 0 : 0.8;
      glowMaterialRef.current.opacity = isFallen ? 0.3 : 0.8;
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
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.03, 0.06, 0.2, 16]} />
          <meshStandardMaterial 
            ref={glowMaterialRef}
            color="#ff00ff" 
            emissive="#ff00ff" 
            emissiveIntensity={0.8} 
            transparent 
            opacity={0.8} 
          />
        </mesh>
        {/* Top Cap */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.02, 0.03, 0.1, 16]} />
          <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    </mesh>
  );
});

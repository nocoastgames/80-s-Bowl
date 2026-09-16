import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { AdditiveBlending, DoubleSide, Group } from 'three';
import { LANE_LENGTH, LANE_WIDTH } from './Lane';
import { rackAnim, SWEEP_MS } from '../../lib/rackAnim';

/** In front of the head pin. */
const SWEEP_FROM = -LANE_LENGTH / 2 + 2.2;
/** Past the back row. */
const SWEEP_TO = -LANE_LENGTH / 2 - 0.8;

/** easeInOutQuad — the bar accelerates in and settles out. */
function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * The sweeper: a bar of light that crosses the pin deck when the rack is
 * cleared, dragging a curtain of glow behind it.
 *
 * Purely decorative — it has no physics body and never touches a pin. The pins
 * derez on their own timers, staggered so the wave appears to follow the bar.
 */
export function RackSweeper() {
  const groupRef = useRef<Group>(null);
  const barMat = useRef<any>(null);
  const curtainMat = useRef<any>(null);
  const edgeMat = useRef<any>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    const started = rackAnim.sweepStartedAt;
    if (!started) {
      if (g.visible) g.visible = false;
      return;
    }

    const t = (performance.now() - started) / SWEEP_MS;
    if (t >= 1) {
      g.visible = false;
      rackAnim.sweepStartedAt = 0;
      return;
    }

    g.visible = true;
    g.position.z = SWEEP_FROM + (SWEEP_TO - SWEEP_FROM) * ease(t);

    // Fade in and back out so the bar arrives and leaves as light rather than
    // popping into existence.
    const fade = Math.sin(Math.PI * t);
    if (barMat.current) barMat.current.opacity = fade;
    if (edgeMat.current) edgeMat.current.opacity = fade * 0.9;
    if (curtainMat.current) curtainMat.current.opacity = fade * 0.3;
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Leading edge, riding just above the deck */}
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[LANE_WIDTH, 0.045, 0.05]} />
        <meshBasicMaterial
          ref={barMat}
          color="#00f2ff"
          transparent
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Magenta trailing edge, a beat behind the cyan one */}
      <mesh position={[0, 0.02, 0.09]}>
        <boxGeometry args={[LANE_WIDTH, 0.025, 0.03]} />
        <meshBasicMaterial
          ref={edgeMat}
          color="#ff00ff"
          transparent
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Vertical curtain of light dragged along behind the bar */}
      <mesh position={[0, 0.5, 0.05]}>
        <planeGeometry args={[LANE_WIDTH, 1]} />
        <meshBasicMaterial
          ref={curtainMat}
          color="#00f2ff"
          transparent
          opacity={0.3}
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

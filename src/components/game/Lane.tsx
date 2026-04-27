import { useBox } from '@react-three/cannon';

export const LANE_WIDTH = 2.4;
export const LANE_LENGTH = 20;
export const GUTTER_WIDTH = 0.6;

export function Lane() {
  // Main Lane
  const [laneRef] = useBox(() => ({
    type: 'Static',
    args: [LANE_WIDTH, 0.2, LANE_LENGTH],
    position: [0, -0.1, 0],
    material: { friction: 0.1, restitution: 0.5 }
  }));

  // Left Gutter
  const [leftGutterRef] = useBox(() => ({
    type: 'Static',
    args: [GUTTER_WIDTH, 0.2, LANE_LENGTH],
    position: [-(LANE_WIDTH / 2 + GUTTER_WIDTH / 2), -0.15, 0],
    material: { friction: 0.1, restitution: 0.1 }
  }));

  // Right Gutter
  const [rightGutterRef] = useBox(() => ({
    type: 'Static',
    args: [GUTTER_WIDTH, 0.2, LANE_LENGTH],
    position: [LANE_WIDTH / 2 + GUTTER_WIDTH / 2, -0.15, 0],
    material: { friction: 0.1, restitution: 0.1 }
  }));

  return (
    <group>
      {/* Lane Visual */}
      <mesh ref={laneRef as any} receiveShadow>
        <boxGeometry args={[LANE_WIDTH, 0.2, LANE_LENGTH]} />
        <meshStandardMaterial color="#d2a679" roughness={0.2} metalness={0.1} />
      </mesh>

      {/* Gutters Visual */}
      <mesh ref={leftGutterRef as any} receiveShadow>
        <boxGeometry args={[GUTTER_WIDTH, 0.2, LANE_LENGTH]} />
        <meshStandardMaterial color="#00f2ff" emissive="#00f2ff" emissiveIntensity={0.2} roughness={0.8} />
      </mesh>
      <mesh ref={rightGutterRef as any} receiveShadow>
        <boxGeometry args={[GUTTER_WIDTH, 0.2, LANE_LENGTH]} />
        <meshStandardMaterial color="#00f2ff" emissive="#00f2ff" emissiveIntensity={0.2} roughness={0.8} />
      </mesh>
    </group>
  );
}

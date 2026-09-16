import { useBox } from '@react-three/cannon';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MAT } from '../../lib/physics';

export const LANE_WIDTH = 2.4;
export const LANE_LENGTH = 20;
export const GUTTER_WIDTH = 0.6;

/** Lane surface height. Anything below this is out of play. */
export const LANE_SURFACE_Y = 0;
/**
 * Gutter floor, dropped well below the lane so a ball that falls in rides
 * past the pins instead of clipping their bases on the way by. The old
 * gutters sat only 5cm down, so gutter balls still knocked pins over.
 */
export const GUTTER_FLOOR_Y = -0.35;
/** Half-width of the playing surface; beyond this the ball is in the gutter. */
export const LANE_HALF_WIDTH = LANE_WIDTH / 2;

/** Catch area behind the pins. */
export const PIT_DEPTH = 3;
export const PIT_CENTER_Z = -LANE_LENGTH / 2 - PIT_DEPTH / 2;
export const PIT_BACK_Z = -LANE_LENGTH / 2 - PIT_DEPTH + 0.1;
/** Past this the ball has left the lane, so the roll is over. */
export const PIT_ENTRY_Z = -LANE_LENGTH / 2 - 0.8;

function createLaneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base wood color
  ctx.fillStyle = '#e8cfa6';
  ctx.fillRect(0, 0, 1024, 1024);

  // Draw 39 boards (Standard bowling lane)
  const boards = 39;
  const boardWidth = 1024 / boards;

  for (let i = 0; i < boards; i++) {
    // Slight color variation per board
    const colorVariation = (Math.random() - 0.5) * 20;
    ctx.fillStyle = `rgb(${232 + colorVariation}, ${207 + colorVariation}, ${166 + colorVariation})`;
    ctx.fillRect(i * boardWidth, 0, boardWidth, 1024);

    // Board outline
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i * boardWidth, 0);
    ctx.lineTo(i * boardWidth, 1024);
    ctx.stroke();

    // Fake wood grain
    ctx.strokeStyle = 'rgba(150, 100, 50, 0.05)';
    for (let g = 0; g < 5; g++) {
      ctx.beginPath();
      const xOff = i * boardWidth + Math.random() * boardWidth;
      ctx.moveTo(xOff, 0);
      ctx.lineTo(xOff + (Math.random() - 0.5) * 10, 1024);
      ctx.lineWidth = Math.random() * 2;
      ctx.stroke();
    }
  }

  // Draw Arrows
  ctx.fillStyle = '#333';
  const drawArrow = (bx: number, by: number) => {
    const x = bx * boardWidth;
    const y = by;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - boardWidth, y + 40);
    ctx.lineTo(x + boardWidth, y + 40);
    ctx.fill();
  };

  // Center is board 19 (0-indexed 19)
  const cy = 700;
  drawArrow(19.5, cy);
  drawArrow(14.5, cy + 50);
  drawArrow(24.5, cy + 50);
  drawArrow(9.5, cy + 100);
  drawArrow(29.5, cy + 100);
  drawArrow(4.5, cy + 150);
  drawArrow(34.5, cy + 150);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  texture.anisotropy = 16;
  return texture;
}

/** Static collider with no mesh of its own — keeps the ball and pins in bounds. */
function Wall({
  args,
  position,
}: {
  args: [number, number, number];
  position: [number, number, number];
}) {
  useBox(() => ({
    type: 'Static',
    args,
    position,
    material: MAT.wall,
  }));
  return null;
}

export function Lane() {
  const laneTexture = useMemo(() => createLaneTexture(), []);

  // Dispose the generated canvas texture when the lane unmounts so repeated
  // games don't leak a 1024x1024 texture each time.
  useEffect(() => () => laneTexture?.dispose(), [laneTexture]);

  const gutterCenterX = LANE_HALF_WIDTH + GUTTER_WIDTH / 2;
  const gutterCenterY = GUTTER_FLOOR_Y - 0.1;

  // Main Lane
  const [laneRef] = useBox(() => ({
    type: 'Static',
    args: [LANE_WIDTH, 0.2, LANE_LENGTH],
    position: [0, -0.1, 0],
    material: MAT.lane
  }));

  // Left Gutter
  const [leftGutterRef] = useBox(() => ({
    type: 'Static',
    args: [GUTTER_WIDTH, 0.2, LANE_LENGTH],
    position: [-gutterCenterX, gutterCenterY, 0],
    material: MAT.gutter
  }));

  // Right Gutter
  const [rightGutterRef] = useBox(() => ({
    type: 'Static',
    args: [GUTTER_WIDTH, 0.2, LANE_LENGTH],
    position: [gutterCenterX, gutterCenterY, 0],
    material: MAT.gutter
  }));

  const outerWallX = LANE_HALF_WIDTH + GUTTER_WIDTH;

  return (
    <group>
      {/* Lane Visual */}
      <mesh ref={laneRef as any} receiveShadow>
        <boxGeometry args={[LANE_WIDTH, 0.2, LANE_LENGTH]} />
        <meshStandardMaterial
          map={laneTexture}
          color="#ffffff"
          roughness={0.15}
          metalness={0.1}
          envMapIntensity={0.5}
        />
      </mesh>

      {/* Gutters Visual */}
      <mesh ref={leftGutterRef as any} receiveShadow>
        <boxGeometry args={[GUTTER_WIDTH, 0.2, LANE_LENGTH]} />
        <meshStandardMaterial
          color="#111111"
          emissive="#00f2ff"
          emissiveIntensity={0.6}
          roughness={0.5}
          metalness={0.8}
        />
      </mesh>
      <mesh ref={rightGutterRef as any} receiveShadow>
        <boxGeometry args={[GUTTER_WIDTH, 0.2, LANE_LENGTH]} />
        <meshStandardMaterial
          color="#111111"
          emissive="#00f2ff"
          emissiveIntensity={0.6}
          roughness={0.5}
          metalness={0.8}
        />
      </mesh>

      {/* Inner gutter walls: the lip the ball drops over, and the face that
          stops it climbing back onto the lane. */}
      <mesh position={[-outerWallX + 0.02, GUTTER_FLOOR_Y + 0.3, 0]}>
        <boxGeometry args={[0.04, 0.6, LANE_LENGTH]} />
        <meshStandardMaterial color="#1a1a2e" emissive="#ff00ff" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[outerWallX - 0.02, GUTTER_FLOOR_Y + 0.3, 0]}>
        <boxGeometry args={[0.04, 0.6, LANE_LENGTH]} />
        <meshStandardMaterial color="#1a1a2e" emissive="#ff00ff" emissiveIntensity={0.3} />
      </mesh>

      {/* Colliders: side walls keep a gutter ball contained, the backstop
          catches the ball and pins instead of letting them fly off forever.
          The walls run the length of the lane *and* the pit, so pins thrown
          sideways at the end can't escape. */}
      <Wall
        args={[0.1, 1.2, LANE_LENGTH + PIT_DEPTH]}
        position={[-outerWallX, GUTTER_FLOOR_Y + 0.6, -PIT_DEPTH / 2]}
      />
      <Wall
        args={[0.1, 1.2, LANE_LENGTH + PIT_DEPTH]}
        position={[outerWallX, GUTTER_FLOOR_Y + 0.6, -PIT_DEPTH / 2]}
      />
      {/* Backstop, set far enough past the pins that a rolled ball clearly
          leaves the lane before it hits — the roll ends on that, not a timeout. */}
      <Wall args={[outerWallX * 2, 2, 0.2]} position={[0, 0.5, PIT_BACK_Z]} />

      {/* Pit floor behind the pins, so nothing falls into the void. */}
      <Wall args={[outerWallX * 2, 0.2, PIT_DEPTH]} position={[0, GUTTER_FLOOR_Y - 0.1, PIT_CENTER_Z]} />
      <mesh position={[0, GUTTER_FLOOR_Y, PIT_CENTER_Z]} receiveShadow>
        <boxGeometry args={[outerWallX * 2, 0.02, PIT_DEPTH]} />
        <meshStandardMaterial color="#0a0a0f" roughness={0.9} />
      </mesh>
    </group>
  );
}

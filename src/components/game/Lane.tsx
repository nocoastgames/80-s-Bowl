import { useBox } from '@react-three/cannon';
import { useMemo } from 'react';
import * as THREE from 'three';

export const LANE_WIDTH = 2.4;
export const LANE_LENGTH = 20;
export const GUTTER_WIDTH = 0.6;

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
    for(let g = 0; g < 5; g++) {
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

export function Lane() {
  const laneTexture = useMemo(() => createLaneTexture(), []);

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
    </group>
  );
}

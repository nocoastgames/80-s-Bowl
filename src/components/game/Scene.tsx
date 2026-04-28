import { Physics, useBox } from '@react-three/cannon';
import { Environment, PerspectiveCamera, Grid, Float } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Vector3, Mesh, Euler, Group } from 'three';
import { useStore } from '../../store';
import { Ball, BallRef } from './Ball';
import { Lane, LANE_LENGTH } from './Lane';
import { Pin, PinRef } from './Pin';
import { audioEngine } from '../../lib/audio';

const PIN_POSITIONS: [number, number, number][] = [
  [0, 0.45, -LANE_LENGTH / 2 + 1.2], // 1
  [-0.25, 0.45, -LANE_LENGTH / 2 + 0.85], // 2
  [0.25, 0.45, -LANE_LENGTH / 2 + 0.85], // 3
  [-0.5, 0.45, -LANE_LENGTH / 2 + 0.5], // 4
  [0, 0.45, -LANE_LENGTH / 2 + 0.5], // 5
  [0.5, 0.45, -LANE_LENGTH / 2 + 0.5], // 6
  [-0.75, 0.45, -LANE_LENGTH / 2 + 0.15], // 7
  [-0.25, 0.45, -LANE_LENGTH / 2 + 0.15], // 8
  [0.25, 0.45, -LANE_LENGTH / 2 + 0.15], // 9
  [0.75, 0.45, -LANE_LENGTH / 2 + 0.15], // 10
];

function FloatingTriangles() {
  const triangles = Array.from({ length: 20 }).map((_, i) => ({
    position: [
      (Math.random() - 0.5) * 40,
      Math.random() * 10 + 2,
      (Math.random() - 0.5) * 40 - 10
    ] as [number, number, number],
    rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] as [number, number, number],
    scale: Math.random() * 1.5 + 0.5,
    color: Math.random() > 0.5 ? '#ff00ff' : '#00f2ff'
  }));

  return (
    <>
      {triangles.map((props, i) => (
        <Float key={i} speed={2} rotationIntensity={2} floatIntensity={2}>
          <mesh position={props.position} rotation={props.rotation} scale={props.scale}>
            <coneGeometry args={[1, 2, 3]} />
            <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.5} wireframe />
          </mesh>
        </Float>
      ))}
    </>
  );
}

function AimGuide() {
  const groupRef = useRef<Group>(null);
  const pivotRef = useRef<Group>(null);

  useFrame(() => {
    const state = useStore.getState();
    if (groupRef.current) {
      groupRef.current.position.x = 0; // Always start in middle
      groupRef.current.visible = state.playState === 'spin' || state.playState === 'aiming';
    }
    if (pivotRef.current) {
      pivotRef.current.rotation.y = state.playState === 'spin' ? 0 : state.aimAngle;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.11, 9]}>
      <group ref={pivotRef}>
        <mesh position={[0, 0, -3]}>
          <boxGeometry args={[0.05, 0.01, 6]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.6} />
        </mesh>
        {/* Arrow head */}
        <mesh position={[0, 0, -6]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.15, 0.5, 3]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.8} />
        </mesh>
      </group>
    </group>
  );
}

function Bumpers() {
  const { bumpersEnabled } = useStore();
  if (!bumpersEnabled) return null;
  
  return (
    <>
      <Bumper position={[-1.25, 0.1, 0]} />
      <Bumper position={[1.25, 0.1, 0]} />
    </>
  );
}

function Bumper({ position }: { position: [number, number, number] }) {
  const [ref] = useBox(() => ({
    type: 'Static',
    args: [0.1, 0.2, LANE_LENGTH],
    position,
    material: { friction: 0.1, restitution: 0.5 }
  }));
  
  return (
    <mesh ref={ref as any}>
      <boxGeometry args={[0.1, 0.2, LANE_LENGTH]} />
      <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={0.5} />
    </mesh>
  );
}

function GameController({ ballRef, pinRefs }: { ballRef: React.RefObject<BallRef | null>, pinRefs: React.MutableRefObject<(PinRef | null)[]> }) {
  const { playState, setPlayState, aimAngle, powerLevel, setPinsDown, advanceRoll, pinResetTrigger } = useStore();
  const cameraRef = useRef<any>(null);
  const rollTimer = useRef<number>(0);
  const fallenPinsThisRoll = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (pinResetTrigger > 0) {
      ballRef.current?.reset();
      pinRefs.current.forEach(p => p?.reset());
      fallenPinsThisRoll.current.clear();
      if (playState !== 'spin' && playState !== 'scoring') {
          // ensure playing state aligns with physical reset if needed, but the user requested reset pins
      }
    }
  }, [pinResetTrigger]);

  useFrame((state, delta) => {
    if (!cameraRef.current) return;

    // Camera follow logic
    if (playState === 'rolling' || playState === 'scoring') {
      if (ballRef.current) {
        const ballPos = ballRef.current.getPosition();
        const targetZ = Math.max(ballPos[2] + 3, -LANE_LENGTH / 2 + 5);
        const targetY = 1.5;
        
        cameraRef.current.position.lerp(new Vector3(0, targetY, targetZ), 0.1);
        cameraRef.current.lookAt(0, 0, -LANE_LENGTH / 2);
      }

      // Check if rolling is done (ball is far down the lane or stopped)
      if (playState === 'rolling') {
        rollTimer.current += delta;
        const ballPos = ballRef.current?.getPosition();
        
        // Play strike sound when pins start to fall
        pinRefs.current.forEach((pin, idx) => {
          if (!pin || fallenPinsThisRoll.current.has(idx)) return;
          const rot = pin.getRotation();
          const euler = new Euler(rot[0], rot[1], rot[2]);
          const currentUp = new Vector3(0, 1, 0).applyEuler(euler);
          if (currentUp.angleTo(new Vector3(0, 1, 0)) > 0.3) {
            fallenPinsThisRoll.current.add(idx);
            audioEngine.playStrike();
          }
        });
        
        // If ball is past pins or 8 seconds have passed
        if ((ballPos && ballPos[2] < -LANE_LENGTH / 2 - 1) || rollTimer.current > 8) {
          setPlayState('scoring');
          rollTimer.current = 0;
          audioEngine.stopRoll();
        }
      }
    } else {
      // Reset camera
      cameraRef.current.position.lerp(new Vector3(0, 2, 11), 0.1);
      cameraRef.current.lookAt(0, 0, 0);
    }

    // Scoring logic
    if (playState === 'scoring') {
      rollTimer.current += delta;
      
      // Wait 3 seconds for pins to settle
      if (rollTimer.current > 3) {
        let downCount = 0;
        pinRefs.current.forEach((pin) => {
          if (!pin) return;
          const rot = pin.getRotation();
          const pos = pin.getPosition();
          
          // Check if pin is knocked over using up vector
          const euler = new Euler(rot[0], rot[1], rot[2]);
          const currentUp = new Vector3(0, 1, 0).applyEuler(euler);
          const angle = currentUp.angleTo(new Vector3(0, 1, 0));
          
          const isFallen = angle > 1.0 || pos[1] < 0;
          if (isFallen) downCount++;
        });
        
        setPinsDown(downCount);
        
        const { currentFrame, currentRoll, playerFrames, players, currentPlayerIndex, totalFrames } = useStore.getState();
        const playerId = players[currentPlayerIndex].id;
        const frame = playerFrames[playerId][currentFrame];
        
        let pinsThisRoll = downCount;
        if (currentRoll === 2 && currentFrame < totalFrames - 1) {
          pinsThisRoll = Math.max(0, downCount - (frame.roll1 || 0));
        } else if (currentFrame === totalFrames - 1) {
          if (currentRoll === 2 && frame.roll1 !== 10) {
            pinsThisRoll = Math.max(0, downCount - (frame.roll1 || 0));
          } else if (currentRoll === 3 && frame.roll2 !== 10 && frame.roll1 === 10) {
            pinsThisRoll = Math.max(0, downCount - (frame.roll2 || 0));
          } else if (currentRoll === 3 && frame.roll1 !== 10) {
            pinsThisRoll = downCount;
          }
        }
        
        advanceRoll(pinsThisRoll);
        
        const nextState = useStore.getState();
        if (nextState.gameState !== 'results' && !nextState.teacherAdvancePending) {
          ballRef.current?.reset();
          
          const isNextFrame = nextState.currentFrame > currentFrame;
          const isNextPlayer = nextState.currentPlayerIndex !== currentPlayerIndex;
          const isLastFrameReset = currentFrame === totalFrames - 1 && (
            (currentRoll === 1 && pinsThisRoll === 10) || 
            (currentRoll === 2 && (frame.roll1 || 0) + pinsThisRoll === 10) ||
            (currentRoll === 2 && frame.roll1 === 10 && pinsThisRoll === 10)
          );
          
          if (isNextFrame || isNextPlayer || isLastFrameReset) {
            pinRefs.current.forEach(p => p?.reset());
          } else {
            // Hide fallen pins between rolls
            pinRefs.current.forEach(p => {
              if (p) {
                const rot = p.getRotation();
                const pos = p.getPosition();
                const euler = new Euler(rot[0], rot[1], rot[2]);
                const currentUp = new Vector3(0, 1, 0).applyEuler(euler);
                const angle = currentUp.angleTo(new Vector3(0, 1, 0));
                if (angle > 1.0 || pos[1] < 0) {
                  p.hide();
                }
              }
            });
          }
          
          setTimeout(() => {
            useStore.setState({ spinAmount: 0 });
            setPlayState('spin');
            fallenPinsThisRoll.current.clear();
          }, 1500);
        } else if (nextState.teacherAdvancePending) {
           ballRef.current?.reset();
           pinRefs.current.forEach(p => p?.reset());
        }
        
        rollTimer.current = 0;
      }
    }
  });

  // Handle Roll Trigger
  useEffect(() => {
    if (playState === 'rolling' && ballRef.current) {
      ballRef.current.roll(aimAngle, powerLevel);
      rollTimer.current = 0;
    }
  }, [playState, aimAngle, powerLevel]);

  // Reset pins when game ends
  useEffect(() => {
    if (useStore.getState().gameState === 'results') {
      ballRef.current?.reset();
      pinRefs.current.forEach(p => p?.reset());
    }
  }, [useStore.getState().gameState]);

  return <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 2, 11]} fov={50} />;
}

export function Scene() {
  const ballRef = useRef<BallRef>(null);
  const pinRefs = useRef<(PinRef | null)[]>([]);
  const isPaused = useStore((state) => state.isPaused);

  return (
    <>
      <color attach="background" args={['#0a0a0f']} />
      <fog attach="fog" args={['#0a0a0f', 10, 30]} />
      
      <ambientLight intensity={0.5} />
      <directionalLight position={[0, 10, 5]} intensity={1} castShadow />
      <pointLight position={[0, 2, -15]} intensity={2} color="#00f2ff" />
      
      <Grid
        position={[0, -0.01, 0]}
        args={[40, 40]}
        cellSize={1}
        cellThickness={1}
        cellColor="#00f2ff"
        sectionSize={5}
        sectionThickness={1.5}
        sectionColor="#ff00ff"
        fadeDistance={30}
        fadeStrength={1}
      />
      
      <FloatingTriangles />

      <AimGuide />

      <Physics isPaused={isPaused} gravity={[0, -9.81, 0]} defaultContactMaterial={{ friction: 0.1, restitution: 0.2 }}>
        <GameController ballRef={ballRef} pinRefs={pinRefs} />
        <Lane />
        <Bumpers />
        <Ball ref={ballRef} />
        {PIN_POSITIONS.map((pos, i) => (
          <Pin
            key={i}
            id={i}
            position={pos}
            ref={(el) => { pinRefs.current[i] = el; }}
          />
        ))}
      </Physics>
    </>
  );
}

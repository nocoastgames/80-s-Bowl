import { Physics, useBox, useContactMaterial } from '@react-three/cannon';
import { PerspectiveCamera, Grid, Float } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3, Group } from 'three';
import { useStore, useActiveSettings, getActiveSettings } from '../../store';
import { Ball, BallRef } from './Ball';
import { Lane, LANE_LENGTH, LANE_HALF_WIDTH, PIT_ENTRY_Z } from './Lane';
import { Pin, PinRef, tiltAngle } from './Pin';
import { audioEngine } from '../../lib/audio';
import { sweep } from '../../lib/sweep';
import { MAT, CONTACT_PAIRS, type ContactPair } from '../../lib/physics';
import { RackSweeper } from './RackSweeper';
import {
  triggerSweep,
  DEREZ_STAGGER_MS,
  MATERIALIZE_STAGGER_MS,
  RACK_CLEAR_MS,
  RACK_RESET_MS,
} from '../../lib/rackAnim';

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

/** Ball centre further out than this means it has left the playing surface. */
const GUTTER_X = LANE_HALF_WIDTH - 0.05;
/** Once in the gutter, let it ride for a beat then score — no need to wait it out. */
const GUTTER_LINGER_S = 1.2;
/** Minimum time in 'scoring' before we start looking for a settled rack. */
const MIN_SETTLE_S = 1.0;
/** Hard cap on settling, in case something is still jittering. */
const MAX_SETTLE_S = 3.4;
/** Pause between scoring and the next bowler taking control. */
const NEXT_TURN_DELAY_MS = 900;

/**
 * Camera smooth times, in seconds — roughly how long each move takes. Driven
 * against frame delta, so a move takes the same real time on a 144Hz monitor
 * as on a Chromebook running at 30.
 */
const CAMERA_FOLLOW_SMOOTH = 0.22;
/**
 * Deliberately far slower than the follow. The camera used to
 * snap back the instant scoring ended, which meant it was retreating up the
 * lane exactly while the pins were being swept — the animation played to
 * nobody.
 */
const CAMERA_RETURN_SMOOTH = 0.85;
/** Closest the follow camera gets to the pin deck; also the "watch it" view. */
const DECK_VIEW_Z = -LANE_LENGTH / 2 + 5;
/** Extra time held at the deck after the sweep, before pulling back. */
const DECK_HOLD_TAIL_MS = 300;
/** Settling at the deck once the ball has gone. */
const CAMERA_DECK_SMOOTH = 0.4;
/**
 * How much of the camera's journey back to the foul line to wait out before
 * handing control over. Without this the next bowler gets the switch while the
 * camera is still halfway down the lane and the aim guide is behind it.
 */
const CAMERA_RETURN_SETTLE_MS = 800;
/** Total pause when a sweep runs: watch it, then ride the camera back. */
const SWEEP_HANDOVER_MS = RACK_CLEAR_MS + DECK_HOLD_TAIL_MS + CAMERA_RETURN_SETTLE_MS;

/**
 * How long the end of a turn plays out before the game offers to move on.
 *
 * Long enough for the celebration banner and the full rack reset, so the class
 * gets to watch the pins go down and come back. Shorter with reduced motion,
 * where there is nothing to watch.
 */
const TURN_SUMMARY_MS = 2100;
const REDUCED_TURN_SUMMARY_MS = 900;

/**
 * Critically damped spring, the standard smooth-camera move.
 *
 * An exponential lerp is at its fastest on the very first frame, so a camera
 * starting from rest lurches and then crawls. This carries velocity instead,
 * so it eases out of rest, accelerates, and settles without overshooting —
 * and because the velocity persists across target changes, switching targets
 * mid-move bends the path rather than snapping it.
 *
 * Mutates `current` and `velocity` in place. `smoothTime` is roughly how long
 * the move takes.
 */
const SMOOTH_AXES = ['x', 'y', 'z'] as const;

function smoothDamp(
  current: Vector3,
  target: Vector3,
  velocity: Vector3,
  smoothTime: number,
  delta: number
) {
  const dt = Math.min(delta, 0.1);
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  for (const axis of SMOOTH_AXES) {
    const change = current[axis] - target[axis];
    const temp = (velocity[axis] + omega * change) * dt;
    velocity[axis] = (velocity[axis] - omega * temp) * decay;
    current[axis] = target[axis] + (change + temp) * decay;
  }
}
/** Give up on a roll that never reaches the pins. */
const ROLL_TIMEOUT_S = 6;

/**
 * Add ?debug=1 to the URL to publish live ball and pin state on
 * `window.__bowl`. Physics problems here are invisible from the outside — a
 * body at a NaN position simply stops being drawn — so having a way to read
 * the actual numbers beats inferring them from screenshots.
 */
const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

function FloatingTriangles() {
  const reduceMotion = useStore((s) => s.reduceMotion);

  const triangles = useMemo(
    () =>
      Array.from({ length: 20 }).map(() => ({
        position: [
          (Math.random() - 0.5) * 40,
          Math.random() * 10 + 2,
          (Math.random() - 0.5) * 40 - 10
        ] as [number, number, number],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] as [number, number, number],
        scale: Math.random() * 1.5 + 0.5,
        color: Math.random() > 0.5 ? '#ff00ff' : '#00f2ff'
      })),
    []
  );

  // Drifting shapes in peripheral vision are exactly the kind of thing that
  // makes this unusable for a light-sensitive student, so reduced motion
  // removes them rather than just slowing them down.
  if (reduceMotion) return null;

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
  const matRef = useRef<any>(null);
  const { oneTouch } = useActiveSettings();
  const reduceMotion = useStore((s) => s.reduceMotion);

  useFrame(({ clock }) => {
    const state = useStore.getState();
    if (groupRef.current) {
      groupRef.current.position.x = 0; // Always start in middle
      groupRef.current.visible = state.playState === 'spin' || state.playState === 'aiming';
    }
    if (pivotRef.current) {
      // Read the live sweep value directly — it never round-trips through the
      // store, so aiming costs zero React renders.
      pivotRef.current.rotation.y = state.playState === 'spin' ? 0 : sweep.aim;
    }
    if (matRef.current) {
      matRef.current.opacity =
        oneTouch && !reduceMotion ? 0.6 + Math.sin(clock.elapsedTime * 6) * 0.4 : 0.8;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.11, 9]}>
      <group ref={pivotRef}>
        <mesh position={[0, 0, -3]}>
          <boxGeometry args={oneTouch ? [0.15, 0.02, 8] : [0.05, 0.01, 6]} />
          <meshBasicMaterial color={oneTouch ? '#00ff00' : '#ffff00'} transparent opacity={0.6} />
        </mesh>
        {/* Arrow head */}
        <mesh position={oneTouch ? [0, 0, -7] : [0, 0, -6]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={oneTouch ? [0.4, 1.0, 3] : [0.15, 0.5, 3]} />
          <meshBasicMaterial ref={matRef} color={oneTouch ? '#00ff00' : '#ffff00'} transparent opacity={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Registers the contact pairs. cannon-es only applies friction and restitution
 * from a ContactMaterial matching the two colliding bodies' materials, so
 * without this every collision falls back to the world default.
 */
function PhysicsMaterials() {
  return (
    <>
      {CONTACT_PAIRS.map((pair) => (
        <ContactPairBinding key={`${pair.a}-${pair.b}`} pair={pair} />
      ))}
    </>
  );
}

function ContactPairBinding({ pair }: { pair: ContactPair }) {
  // Only include the solver tuning keys when the pair actually sets them.
  //
  // cannon-es fills its defaults with `if (!(key in options))`, and a key
  // passed explicitly as `undefined` still satisfies `in`. Sending
  // `contactEquationStiffness: undefined` therefore *suppressed* the default
  // instead of requesting it, and the solver went on to compute its Spook
  // parameters from undefined. That produced NaN, which spread through the
  // contacts into every dynamic body — the ball and all ten pins ended up at
  // NaN positions, so they vanished, collided with nothing, and could never
  // register as knocked down. The static lane was unaffected, which is why
  // only half the scene looked broken.
  const options = useMemo(() => {
    const o: Record<string, number> = {
      friction: pair.friction,
      restitution: pair.restitution,
    };
    if (pair.contactEquationStiffness !== undefined) {
      o.contactEquationStiffness = pair.contactEquationStiffness;
    }
    if (pair.contactEquationRelaxation !== undefined) {
      o.contactEquationRelaxation = pair.contactEquationRelaxation;
    }
    return o;
  }, [pair]);

  useContactMaterial(pair.a, pair.b, options, []);
  return null;
}

function Bumpers() {
  // Bumpers follow the *current bowler's* profile, so one game can mix students
  // who need them with students who don't.
  const { bumpers } = useActiveSettings();
  if (!bumpers) return null;

  return (
    <>
      <Bumper position={[-(LANE_HALF_WIDTH + 0.05), 0.2, 0]} />
      <Bumper position={[LANE_HALF_WIDTH + 0.05, 0.2, 0]} />
    </>
  );
}

function Bumper({ position }: { position: [number, number, number] }) {
  const matRef = useRef<any>(null);
  const flashUntil = useRef(0);

  const [ref] = useBox(() => ({
    type: 'Static',
    args: [0.1, 0.4, LANE_LENGTH],
    position,
    material: MAT.bumper,
    onCollide: () => {
      // Sound and light the bumper on contact. For a student who can't easily
      // track a small fast ball, this is the clearest signal that the bumper
      // did its job and the ball is still live.
      const now = performance.now();
      if (now > flashUntil.current) audioEngine.playBumper();
      flashUntil.current = now + 260;
    },
  }));

  useFrame(() => {
    if (!matRef.current) return;
    const remaining = flashUntil.current - performance.now();
    matRef.current.emissiveIntensity = remaining > 0 ? 0.5 + (remaining / 260) * 2.5 : 0.5;
  });

  return (
    <mesh ref={ref as any}>
      <boxGeometry args={[0.1, 0.4, LANE_LENGTH]} />
      <meshStandardMaterial ref={matRef} color="#ff00ff" emissive="#ff00ff" emissiveIntensity={0.5} />
    </mesh>
  );
}

function GameController({ ballRef, pinRefs }: { ballRef: React.RefObject<BallRef | null>, pinRefs: React.MutableRefObject<(PinRef | null)[]> }) {
  const playState = useStore((s) => s.playState);
  const setPlayState = useStore((s) => s.setPlayState);
  const setPinsDown = useStore((s) => s.setPinsDown);
  const advanceRoll = useStore((s) => s.advanceRoll);
  const pinResetTrigger = useStore((s) => s.pinResetTrigger);
  const gameState = useStore((s) => s.gameState);

  const cameraRef = useRef<any>(null);
  const rollTimer = useRef(0);
  const fallenPinsThisRoll = useRef<Set<number>>(new Set());
  const wasGutter = useRef(false);
  const gutterTimer = useRef(0);
  const cameraTarget = useRef(new Vector3(0, 2, 11));
  const cameraVelocity = useRef(new Vector3());
  /** Point the camera is aiming at, eased rather than set directly. */
  const cameraLook = useRef(new Vector3(0, 0, 0));
  const cameraLookTarget = useRef(new Vector3(0, 0, 0));
  const cameraLookVelocity = useRef(new Vector3());
  /** Smooth time in play this frame; each branch picks its own pace. */
  const cameraSmooth = useRef(CAMERA_RETURN_SMOOTH);
  /** Keep the camera at the pin deck until this timestamp. */
  const cameraHoldUntil = useRef(0);

  useEffect(() => {
    if (pinResetTrigger > 0) {
      ballRef.current?.reset();
      pinRefs.current.forEach(p => p?.reset());
      fallenPinsThisRoll.current.clear();
      wasGutter.current = false;
      gutterTimer.current = 0;
    }
  }, [pinResetTrigger]);

  // Clear the lane when the game ends.
  useEffect(() => {
    if (gameState === 'results') {
      ballRef.current?.reset();
      pinRefs.current.forEach(p => p?.reset());
    }
  }, [gameState]);

  useFrame((_, delta) => {
    if (!cameraRef.current) return;

    if (DEBUG) {
      const bp = ballRef.current?.getPosition();
      (window as any).__bowl = {
        playState,
        rollTimer: +rollTimer.current.toFixed(2),
        wasGutter: wasGutter.current,
        bumpersActive: getActiveSettings().bumpers,
        ball: bp ? bp.map((n) => +n.toFixed(2)) : null,
        ballSpeed: +(ballRef.current?.getSpeed() ?? -1).toFixed(2),
        aimAngle: +useStore.getState().aimAngle.toFixed(3),
        powerLevel: +useStore.getState().powerLevel.toFixed(1),
        spinAmount: +useStore.getState().spinAmount.toFixed(3),
        pins: pinRefs.current.map((p) =>
          p
            ? {
                y: +p.getPosition()[1].toFixed(2),
                // Tilt in degrees against the 57-degree fallen threshold, plus
                // whether the pin has actually stopped. A pin sitting near the
                // threshold and still rotating is the signature of a rack
                // counted before it finished falling.
                tilt: +((tiltAngle(p.getRotation()) * 180) / Math.PI).toFixed(1),
                displaced: +p.getDisplacement().toFixed(2),
                fallen: p.isFallen(),
                settled: p.isSettled(),
              }
            : null
        ),
      };
    }

    if (playState === 'rolling' || playState === 'scoring') {
      const ballPos = ballRef.current?.getPosition();
      if (ballPos) {
        const targetZ = Math.max(ballPos[2] + 3, DECK_VIEW_Z);
        cameraTarget.current.set(0, 1.5, targetZ);
        cameraLookTarget.current.set(0, 0, -LANE_LENGTH / 2);
        cameraSmooth.current = CAMERA_FOLLOW_SMOOTH;
      }

      if (playState === 'rolling') {
        rollTimer.current += delta;

        // Sound each pin the moment it starts to tip.
        pinRefs.current.forEach((pin, idx) => {
          if (!pin || fallenPinsThisRoll.current.has(idx)) return;
          if (pin.isTipping()) {
            fallenPinsThisRoll.current.add(idx);
            audioEngine.playStrike();
          }
        });

        // Gutter: the ball has left the playing surface. The deepened gutters
        // mean it physically can't reach the pins from here, so there's nothing
        // left to watch — let it ride briefly, then score it.
        if (ballPos && Math.abs(ballPos[0]) > GUTTER_X && ballPos[1] < 0.1) {
          if (!wasGutter.current) {
            wasGutter.current = true;
            gutterTimer.current = 0;
            audioEngine.playGutter();
          }
        }
        if (wasGutter.current) gutterTimer.current += delta;

        const reachedPit = !!ballPos && ballPos[2] < PIT_ENTRY_Z;
        if (reachedPit || rollTimer.current > ROLL_TIMEOUT_S || gutterTimer.current > GUTTER_LINGER_S) {
          setPlayState('scoring');
          rollTimer.current = 0;
          audioEngine.stopRoll();
        }
      }
    } else if (performance.now() < cameraHoldUntil.current) {
      // Stay down at the pin deck while the rack is cleared and reset, so the
      // sweep is actually watched rather than happening off in the distance
      // behind a camera already on its way back.
      cameraTarget.current.set(0, 1.5, DECK_VIEW_Z);
      cameraLookTarget.current.set(0, 0, -LANE_LENGTH / 2);
      cameraSmooth.current = CAMERA_DECK_SMOOTH;
    } else {
      // Ease back to the foul line. Slow enough that the tail of the reset is
      // still visible as the camera pulls away.
      cameraTarget.current.set(0, 2, 11);
      cameraLookTarget.current.set(0, 0, 0);
      cameraSmooth.current = CAMERA_RETURN_SMOOTH;
    }

    // One spring for position and one for the look target, driven every frame
    // regardless of which branch set them.
    //
    // The look target used to be snapped with a direct lookAt per branch, so
    // the instant the camera stopped following the ball its aim cut from the
    // pins to the middle of the lane in a single frame. The position glided
    // and the orientation jumped, which is what made the move feel harsh.
    smoothDamp(cameraRef.current.position, cameraTarget.current, cameraVelocity.current, cameraSmooth.current, delta);
    smoothDamp(cameraLook.current, cameraLookTarget.current, cameraLookVelocity.current, cameraSmooth.current, delta);
    cameraRef.current.lookAt(cameraLook.current);

    if (playState !== 'scoring') return;

    rollTimer.current += delta;

    // Score as soon as the rack has actually stopped moving, instead of always
    // burning a fixed three seconds. Cuts roughly 1.5s of dead time off every
    // single roll, which adds up fast with a full class waiting their turn.
    if (rollTimer.current < MIN_SETTLE_S) return;
    if (rollTimer.current < MAX_SETTLE_S) {
      const stillMoving = pinRefs.current.some((p) => p && !p.isSettled());
      if (stillMoving) return;
    }

    let downCount = 0;
    pinRefs.current.forEach((pin) => {
      if (pin?.isFallen()) downCount++;
    });

    setPinsDown(downCount);

    const { currentFrame, currentRoll, playerFrames, players, currentPlayerIndex, totalFrames } = useStore.getState();
    const playerId = players[currentPlayerIndex].id;
    const frame = playerFrames[playerId][currentFrame];
    const lastFrameIndex = totalFrames - 1;

    let pinsThisRoll = downCount;
    if (currentRoll === 2 && currentFrame < lastFrameIndex) {
      pinsThisRoll = Math.max(0, downCount - (frame.roll1 || 0));
    } else if (currentFrame === lastFrameIndex) {
      if (currentRoll === 2 && frame.roll1 !== 10) {
        pinsThisRoll = Math.max(0, downCount - (frame.roll1 || 0));
      } else if (currentRoll === 3 && frame.roll2 !== 10 && frame.roll1 === 10) {
        pinsThisRoll = Math.max(0, downCount - (frame.roll2 || 0));
      } else if (currentRoll === 3 && frame.roll1 !== 10) {
        pinsThisRoll = downCount;
      }
    }

    const gutterThisRoll = wasGutter.current;
    advanceRoll(pinsThisRoll, gutterThisRoll);

    const nextState = useStore.getState();
    if (nextState.gameState !== 'results' && !nextState.teacherAdvancePending) {
      ballRef.current?.reset();

      const isNextFrame = nextState.currentFrame > currentFrame;
      const isNextPlayer = nextState.currentPlayerIndex !== currentPlayerIndex;
      const isLastFrameReset = currentFrame === lastFrameIndex && (
        (currentRoll === 1 && pinsThisRoll === 10) ||
        (currentRoll === 2 && (frame.roll1 || 0) + pinsThisRoll === 10) ||
        (currentRoll === 2 && frame.roll1 === 10 && pinsThisRoll === 10)
      );

      const reduceMotion = useStore.getState().reduceMotion;
      const fullRack = isNextFrame || isNextPlayer || isLastFrameReset;
      let handoverDelay = NEXT_TURN_DELAY_MS;

      if (reduceMotion) {
        // No sweep, no derez — swap the deck instantly.
        if (fullRack) {
          pinRefs.current.forEach(p => p?.reset());
        } else {
          pinRefs.current.forEach(p => { if (p?.isFallen()) p.hide(); });
        }
      } else if (fullRack) {
        // Clear the whole deck as a wave, run the sweeper across it, then beam
        // a fresh rack back in behind it.
        //
        // Hold the camera at the deck for the clear and the sweeper pass, then
        // let it start easing back while the fresh pins beam in — so the last
        // thing you see as you pull away is the rack coming back.
        cameraHoldUntil.current = performance.now() + RACK_CLEAR_MS + DECK_HOLD_TAIL_MS;
        audioEngine.playSweep();
        triggerSweep();
        pinRefs.current.forEach((p, i) => p?.derez(i * DEREZ_STAGGER_MS));
        setTimeout(() => {
          pinRefs.current.forEach((p, i) => {
            p?.reset();
            p?.materialize(i * MATERIALIZE_STAGGER_MS);
          });
        }, RACK_CLEAR_MS);
        handoverDelay = Math.max(RACK_RESET_MS, SWEEP_HANDOVER_MS);
      } else {
        // Between rolls only the downed pins are swept away; the standing ones
        // have to stay exactly where they are for the spare attempt.
        let order = 0;
        pinRefs.current.forEach((p) => {
          if (p?.isFallen()) {
            p.derez(order * DEREZ_STAGGER_MS);
            order++;
          }
        });
        if (order > 0) {
          cameraHoldUntil.current = performance.now() + RACK_CLEAR_MS + DECK_HOLD_TAIL_MS;
          audioEngine.playSweep();
          triggerSweep();
          setTimeout(() => {
            pinRefs.current.forEach(p => { if (p?.isFallen()) p.hide(); });
          }, RACK_CLEAR_MS);
          handoverDelay = Math.max(NEXT_TURN_DELAY_MS, SWEEP_HANDOVER_MS);
        }
      }

      setTimeout(() => {
        const s = useStore.getState();
        if (s.gameState !== 'playing' || s.teacherAdvancePending) return;
        const settings = getActiveSettings();
        useStore.setState({
          spinAmount: 0,
          playState: settings.oneTouch ? 'aiming' : 'spin',
        });
        fallenPinsThisRoll.current.clear();
      }, handoverDelay);
    } else if (nextState.teacherAdvancePending) {
      // Class mode: the turn is over. Play the celebration and rack reset
      // first, and only then offer the advance — otherwise the prompt lands on
      // top of the visuals the class is watching, and pressing it cuts them off.
      ballRef.current?.reset();
      const reduce = useStore.getState().reduceMotion;

      if (reduce) {
        pinRefs.current.forEach(p => p?.reset());
      } else {
        cameraHoldUntil.current = performance.now() + RACK_CLEAR_MS + DECK_HOLD_TAIL_MS;
        audioEngine.playSweep();
        triggerSweep();
        pinRefs.current.forEach((p, i) => p?.derez(i * DEREZ_STAGGER_MS));
        setTimeout(() => {
          pinRefs.current.forEach((p, i) => {
            p?.reset();
            p?.materialize(i * MATERIALIZE_STAGGER_MS);
          });
        }, RACK_CLEAR_MS);
      }

      setTimeout(() => {
        const s = useStore.getState();
        // The teacher may have already undone the roll or ended the game.
        if (!s.teacherAdvancePending || s.gameState !== 'playing') return;
        if (s.teacherAdvanceRequired) {
          s.setAdvanceReady(true);
        } else {
          s.nextPlayer();
        }
      }, reduce ? REDUCED_TURN_SUMMARY_MS : TURN_SUMMARY_MS);

      fallenPinsThisRoll.current.clear();
    }

    rollTimer.current = 0;
    wasGutter.current = false;
    gutterTimer.current = 0;
  });

  // Handle Roll Trigger
  useEffect(() => {
    if (playState === 'rolling' && ballRef.current) {
      const { aimAngle, powerLevel } = useStore.getState();
      ballRef.current.roll(aimAngle, powerLevel);
      rollTimer.current = 0;
      wasGutter.current = false;
      gutterTimer.current = 0;
    }
  }, [playState]);

  return <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 2, 11]} fov={50} />;
}

export function Scene() {
  const ballRef = useRef<BallRef>(null);
  const pinRefs = useRef<(PinRef | null)[]>([]);
  const isPaused = useStore((state) => state.isPaused);
  const reduceMotion = useStore((state) => state.reduceMotion);

  return (
    <>
      <color attach="background" args={['#0a0a0f']} />
      <fog attach="fog" args={['#0a0a0f', 10, 30]} />

      <ambientLight intensity={reduceMotion ? 0.7 : 0.5} />
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
      <RackSweeper />

      {/* More solver iterations than the default 5: a fast, heavy ball against
          a thin static wall is exactly the case where a loose solver lets the
          contact mush out instead of rebounding. Cheap at this body count. */}
      <Physics
        isPaused={isPaused}
        gravity={[0, -9.81, 0]}
        iterations={12}
        defaultContactMaterial={{ friction: 0.1, restitution: 0.2 }}
      >
        <PhysicsMaterials />
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

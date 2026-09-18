import { create } from 'zustand';
import { useMemo } from 'react';
import {
  loadSettings,
  saveSettings,
  prefersReducedMotion,
  type PersistedSettings,
} from './lib/persist';

export type GameState = 'menu' | 'setup' | 'playing' | 'results';
export type PlayState = 'idle' | 'spin' | 'aiming' | 'power' | 'rolling' | 'scoring';
export type GameMode = 'single' | 'class';
export type RollOutcome = 'strike' | 'spare' | 'gutter' | 'open';

export interface Player {
  id: string;
  name: string;
  /**
   * Per-student overrides. When undefined the class-wide default applies, so a
   * teacher can run one game where some students bowl with bumpers and a single
   * switch press while others use the full spin/aim/power sequence.
   */
  oneTouchMode?: boolean;
  bumpersEnabled?: boolean;
  sweepSpeed?: number;
  autoAssistMs?: number;
}

export interface Frame {
  roll1: number | null;
  roll2: number | null;
  roll3: number | null;
}

export interface ActiveSettings {
  oneTouch: boolean;
  bumpers: boolean;
  sweepSpeed: number;
  autoAssistMs: number;
}

/** Snapshot of everything `advanceRoll` mutates, so a misfire can be undone. */
interface HistoryEntry {
  playerFrames: Record<string, Frame[]>;
  currentFrame: number;
  currentRoll: 1 | 2 | 3;
  currentPlayerIndex: number;
  gameState: GameState;
}

const createEmptyFrames = (length: number): Frame[] =>
  Array.from({ length }, () => ({ roll1: null, roll2: null, roll3: null }));

export function calculateTotalScore(frames: Frame[], totalFrames: number = 10) {
  let score = 0;
  for (let i = 0; i < totalFrames; i++) {
    const f = frames[i];
    if (!f || f.roll1 === null) break;

    if (f.roll1 === 10) { // Strike
      score += 10;
      if (i < totalFrames - 1) {
        const next = frames[i + 1];
        if (next && next.roll1 !== null) {
          score += next.roll1;
          if (next.roll1 === 10 && i < totalFrames - 2) {
            const nextNext = frames[i + 2];
            if (nextNext && nextNext.roll1 !== null) score += nextNext.roll1;
          } else if (next.roll2 !== null) {
            score += next.roll2;
          }
        }
      } else {
        if (f.roll2 !== null) score += f.roll2;
        if (f.roll3 !== null) score += f.roll3;
      }
    } else if (f.roll1 + (f.roll2 || 0) === 10 && f.roll2 !== null) { // Spare
      score += 10;
      if (i < totalFrames - 1) {
        const next = frames[i + 1];
        if (next && next.roll1 !== null) score += next.roll1;
      } else {
        if (f.roll3 !== null) score += f.roll3;
      }
    } else {
      score += f.roll1 + (f.roll2 || 0);
    }
  }
  return score;
}

interface BowlingStore {
  gameState: GameState;
  setGameState: (state: GameState) => void;
  gameMode: GameMode;
  setGameMode: (mode: GameMode) => void;

  bumpersEnabled: boolean;
  setBumpersEnabled: (enabled: boolean) => void;

  totalFrames: number;
  setTotalFrames: (frames: number) => void;

  players: Player[];
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  setPlayers: (players: Player[]) => void;

  currentPlayerIndex: number;
  playerFrames: Record<string, Frame[]>;
  currentFrame: number;
  currentRoll: 1 | 2 | 3;

  teacherAdvancePending: boolean;
  setTeacherAdvancePending: (pending: boolean) => void;
  /**
   * Whether a turn ends by the teacher pressing Next, or moves on by itself.
   * Off, the game still shows the turn summary before advancing.
   */
  teacherAdvanceRequired: boolean;
  setTeacherAdvanceRequired: (required: boolean) => void;
  /**
   * True once the end-of-turn celebration and rack reset have finished playing.
   * The advance prompt waits for this so it can't cover the visuals or let a
   * turn be skipped through them.
   */
  advanceReady: boolean;
  setAdvanceReady: (ready: boolean) => void;
  nextPlayer: () => void;

  sweepSpeed: number;
  setSweepSpeed: (speed: number) => void;

  playState: PlayState;
  setPlayState: (state: PlayState) => void;
  spinAmount: number;
  setSpinAmount: (spin: number) => void;
  aimAngle: number;
  setAimAngle: (angle: number) => void;
  powerLevel: number;
  setPowerLevel: (power: number) => void;
  pinsDown: number;
  setPinsDown: (count: number) => void;

  /** Result of the roll just completed, used for the celebration banner. */
  lastOutcome: { type: RollOutcome; pins: number; id: number } | null;
  clearLastOutcome: () => void;

  pinResetTrigger: number;
  triggerPinReset: () => void;
  oneTouchMode: boolean;
  setOneTouchMode: (enabled: boolean) => void;

  // --- Accessibility ---
  /** Fire the switch automatically after this many ms of no input. 0 = off. */
  autoAssistMs: number;
  setAutoAssistMs: (ms: number) => void;
  /** Switch must be held this long before it registers (anti-tremor). */
  switchHoldMs: number;
  setSwitchHoldMs: (ms: number) => void;
  /** Ignore further activations for this long after one registers. */
  switchCooldownMs: number;
  setSwitchCooldownMs: (ms: number) => void;
  /** Accept any key, not just Space/Enter — for switch boxes with odd mappings. */
  switchAcceptsAnyKey: boolean;
  setSwitchAcceptsAnyKey: (enabled: boolean) => void;
  reduceMotion: boolean;
  setReduceMotion: (enabled: boolean) => void;

  isPaused: boolean;
  setPaused: (paused: boolean) => void;

  bgmVolume: number;
  setBgmVolume: (vol: number) => void;
  sfxVolume: number;
  setSfxVolume: (vol: number) => void;
  currentStationIndex: number;
  setCurrentStationIndex: (index: number) => void;

  history: HistoryEntry[];
  undoLastRoll: () => void;

  startGame: (singlePlayerName?: string) => void;
  advanceRoll: (pinsDownThisRoll: number, wasGutter?: boolean) => void;
  resetGame: () => void;
}

const persisted = loadSettings();

/**
 * Read a persisted setting, falling back to a default when it is absent.
 *
 * The cast is needed because `persisted` is a `Partial`, and TypeScript will
 * not reduce `Partial<T>[K]` to `T[K]` for a generic `K` even after an
 * undefined check — it can't resolve the indexed access until `K` is known.
 */
function pick<K extends keyof PersistedSettings>(
  key: K,
  fallback: PersistedSettings[K]
): PersistedSettings[K] {
  const value = persisted[key];
  return value === undefined ? fallback : (value as PersistedSettings[K]);
}

/**
 * Resolve the settings that apply to a given player, falling back to the
 * class-wide defaults for anything they do not override.
 */
function resolveSettings(
  player: Player | undefined,
  s: Pick<BowlingStore, 'oneTouchMode' | 'bumpersEnabled' | 'sweepSpeed' | 'autoAssistMs'>
): ActiveSettings {
  return {
    oneTouch: player?.oneTouchMode ?? s.oneTouchMode,
    bumpers: player?.bumpersEnabled ?? s.bumpersEnabled,
    sweepSpeed: player?.sweepSpeed ?? s.sweepSpeed,
    autoAssistMs: player?.autoAssistMs ?? s.autoAssistMs,
  };
}

export const useStore = create<BowlingStore>((set, get) => ({
  gameState: 'menu',
  setGameState: (state) => set({ gameState: state }),
  gameMode: 'class',
  setGameMode: (mode) => set({ gameMode: mode }),

  bumpersEnabled: pick('bumpersEnabled', false),
  setBumpersEnabled: (enabled) => set({ bumpersEnabled: enabled }),

  totalFrames: pick('totalFrames', 10),
  setTotalFrames: (frames) => set({ totalFrames: frames }),

  players: [],
  addPlayer: (name) => set((state) => ({
    players: [...state.players, { id: Math.random().toString(36).substring(2, 9), name }]
  })),
  removePlayer: (id) => set((state) => ({
    players: state.players.filter(p => p.id !== id)
  })),
  updatePlayer: (id, patch) => set((state) => ({
    players: state.players.map(p => (p.id === id ? { ...p, ...patch } : p))
  })),
  setPlayers: (players) => set({ players }),

  currentPlayerIndex: 0,
  playerFrames: {},
  currentFrame: 0,
  currentRoll: 1,

  teacherAdvancePending: false,
  setTeacherAdvancePending: (pending) => set({ teacherAdvancePending: pending }),
  teacherAdvanceRequired: pick('teacherAdvanceRequired', true),
  setTeacherAdvanceRequired: (required) => set({ teacherAdvanceRequired: required }),
  advanceReady: false,
  setAdvanceReady: (ready) => set({ advanceReady: ready }),

  sweepSpeed: pick('sweepSpeed', 0.75),
  setSweepSpeed: (speed) => set({ sweepSpeed: speed }),

  playState: 'idle',
  setPlayState: (state) => set({ playState: state }),
  spinAmount: 0,
  setSpinAmount: (spin) => set({ spinAmount: spin }),
  aimAngle: 0,
  setAimAngle: (angle) => set({ aimAngle: angle }),
  powerLevel: 0,
  setPowerLevel: (power) => set({ powerLevel: power }),
  pinsDown: 0,
  setPinsDown: (count) => set({ pinsDown: count }),

  lastOutcome: null,
  clearLastOutcome: () => set({ lastOutcome: null }),

  pinResetTrigger: 0,
  triggerPinReset: () => set((state) => ({ pinResetTrigger: state.pinResetTrigger + 1 })),
  oneTouchMode: pick('oneTouchMode', false),
  setOneTouchMode: (enabled) => set({ oneTouchMode: enabled }),

  autoAssistMs: pick('autoAssistMs', 0),
  setAutoAssistMs: (ms) => set({ autoAssistMs: ms }),
  switchHoldMs: pick('switchHoldMs', 0),
  setSwitchHoldMs: (ms) => set({ switchHoldMs: ms }),
  switchCooldownMs: pick('switchCooldownMs', 400),
  setSwitchCooldownMs: (ms) => set({ switchCooldownMs: ms }),
  switchAcceptsAnyKey: pick('switchAcceptsAnyKey', false),
  setSwitchAcceptsAnyKey: (enabled) => set({ switchAcceptsAnyKey: enabled }),
  reduceMotion: pick('reduceMotion', prefersReducedMotion()),
  setReduceMotion: (enabled) => set({ reduceMotion: enabled }),

  isPaused: false,
  setPaused: (paused) => set({ isPaused: paused }),
  bgmVolume: pick('bgmVolume', 0.5),
  setBgmVolume: (vol) => set({ bgmVolume: vol }),
  sfxVolume: pick('sfxVolume', 0.8),
  setSfxVolume: (vol) => set({ sfxVolume: vol }),
  currentStationIndex: pick('currentStationIndex', 0),
  setCurrentStationIndex: (index: number) => set({ currentStationIndex: index }),

  history: [],
  undoLastRoll: () => {
    const state = get();
    const prev = state.history[state.history.length - 1];
    if (!prev) return;
    set({
      playerFrames: prev.playerFrames,
      currentFrame: prev.currentFrame,
      currentRoll: prev.currentRoll,
      currentPlayerIndex: prev.currentPlayerIndex,
      gameState: prev.gameState,
      history: state.history.slice(0, -1),
      teacherAdvancePending: false,
      advanceReady: false,
      lastOutcome: null,
      pinsDown: 0,
      playState: 'idle',
      pinResetTrigger: state.pinResetTrigger + 1,
    });
    // Give the physics a beat to settle the freshly reset pins before the
    // player can bowl again.
    setTimeout(() => {
      const s = get();
      if (s.gameState !== 'playing') return;
      const settings = resolveSettings(s.players[s.currentPlayerIndex], s);
      set({ playState: settings.oneTouch ? 'aiming' : 'spin', spinAmount: 0 });
    }, 600);
  },

  startGame: (singlePlayerName) => {
    const state = get();
    let players = state.players;

    if (state.gameMode === 'single') {
      const name = singlePlayerName || 'Player 1';
      players = [{ id: 'p1', name }];
    }

    const playerFrames: Record<string, Frame[]> = {};
    players.forEach(p => {
      playerFrames[p.id] = createEmptyFrames(state.totalFrames);
    });

    const settings = resolveSettings(players[0], state);

    set({
      players,
      playerFrames,
      currentPlayerIndex: 0,
      currentFrame: 0,
      currentRoll: 1,
      gameState: 'playing',
      playState: settings.oneTouch ? 'aiming' : 'spin',
      spinAmount: 0,
      teacherAdvancePending: false,
      advanceReady: false,
      pinsDown: 0,
      history: [],
      lastOutcome: null,
    });
  },

  nextPlayer: () => {
    const state = get();
    const nextIdx = state.currentPlayerIndex + 1;

    if (nextIdx < state.players.length) {
      const settings = resolveSettings(state.players[nextIdx], state);
      set({
        currentPlayerIndex: nextIdx,
        currentRoll: 1,
        teacherAdvancePending: false,
        advanceReady: false,
        playState: settings.oneTouch ? 'aiming' : 'spin',
        spinAmount: 0,
        pinsDown: 0,
        lastOutcome: null,
      });
    } else {
      const nextFrame = state.currentFrame + 1;
      if (nextFrame < state.totalFrames) {
        const settings = resolveSettings(state.players[0], state);
        set({
          currentPlayerIndex: 0,
          currentFrame: nextFrame,
          currentRoll: 1,
          teacherAdvancePending: false,
          advanceReady: false,
          playState: settings.oneTouch ? 'aiming' : 'spin',
          spinAmount: 0,
          pinsDown: 0,
          lastOutcome: null,
        });
      } else {
        set({ gameState: 'results', teacherAdvancePending: false, advanceReady: false, playState: 'idle' });
      }
    }
  },

  advanceRoll: (pinsDownThisRoll, wasGutter = false) => {
    const state = get();
    const playerId = state.players[state.currentPlayerIndex].id;
    const frames = [...state.playerFrames[playerId]];
    const frame = { ...frames[state.currentFrame] };
    const lastFrameIndex = state.totalFrames - 1;

    // Snapshot before mutating so this roll can be undone.
    const snapshot: HistoryEntry = {
      playerFrames: state.playerFrames,
      currentFrame: state.currentFrame,
      currentRoll: state.currentRoll,
      currentPlayerIndex: state.currentPlayerIndex,
      gameState: state.gameState,
    };

    let nextFrame = state.currentFrame;
    let nextRoll = state.currentRoll;
    let isTurnOver = false;
    let outcome: RollOutcome = wasGutter ? 'gutter' : 'open';

    if (state.currentFrame < lastFrameIndex) {
      if (state.currentRoll === 1) {
        frame.roll1 = pinsDownThisRoll;
        if (pinsDownThisRoll === 10) {
          outcome = 'strike';
          isTurnOver = true;
        } else {
          nextRoll = 2;
        }
      } else {
        frame.roll2 = pinsDownThisRoll;
        if ((frame.roll1 || 0) + pinsDownThisRoll === 10) outcome = 'spare';
        isTurnOver = true;
      }
    } else {
      // Last frame gets bonus rolls for a strike or spare.
      if (state.currentRoll === 1) {
        frame.roll1 = pinsDownThisRoll;
        if (pinsDownThisRoll === 10) outcome = 'strike';
        nextRoll = 2;
      } else if (state.currentRoll === 2) {
        frame.roll2 = pinsDownThisRoll;
        if (pinsDownThisRoll === 10 && frame.roll1 === 10) outcome = 'strike';
        else if (frame.roll1 !== 10 && (frame.roll1 || 0) + pinsDownThisRoll === 10) outcome = 'spare';

        if (frame.roll1 === 10 || (frame.roll1 || 0) + pinsDownThisRoll === 10) {
          nextRoll = 3;
        } else {
          isTurnOver = true;
        }
      } else {
        frame.roll3 = pinsDownThisRoll;
        if (pinsDownThisRoll === 10) outcome = 'strike';
        isTurnOver = true;
      }
    }

    frames[state.currentFrame] = frame;
    const lastOutcome = { type: outcome, pins: pinsDownThisRoll, id: Date.now() };
    const history = [...state.history, snapshot].slice(-20);

    if (isTurnOver) {
      if (state.gameMode === 'class' || state.players.length > 1) {
        set({
          playerFrames: { ...state.playerFrames, [playerId]: frames },
          teacherAdvancePending: true,
          advanceReady: false,
          playState: 'idle',
          history,
          lastOutcome,
        });
        return;
      } else {
        if (state.currentFrame < lastFrameIndex) {
          nextFrame++;
          nextRoll = 1;
        } else {
          set({
            playerFrames: { ...state.playerFrames, [playerId]: frames },
            gameState: 'results',
            playState: 'idle',
            history,
            lastOutcome,
          });
          return;
        }
      }
    }

    set({
      playerFrames: { ...state.playerFrames, [playerId]: frames },
      currentFrame: nextFrame,
      currentRoll: nextRoll as 1 | 2 | 3,
      playState: 'idle',
      history,
      lastOutcome,
    });
  },

  resetGame: () => set((state) => ({
    gameState: 'menu',
    players: [],
    playerFrames: {},
    currentPlayerIndex: 0,
    currentFrame: 0,
    currentRoll: 1,
    teacherAdvancePending: false,
    advanceReady: false,
    playState: 'idle',
    spinAmount: 0,
    pinsDown: 0,
    history: [],
    lastOutcome: null,
    pinResetTrigger: state.pinResetTrigger + 1
  }))
}));

/** Settings for whoever is bowling right now, with per-student overrides applied. */
export function useActiveSettings(): ActiveSettings {
  const players = useStore((s) => s.players);
  const currentPlayerIndex = useStore((s) => s.currentPlayerIndex);
  const oneTouchMode = useStore((s) => s.oneTouchMode);
  const bumpersEnabled = useStore((s) => s.bumpersEnabled);
  const sweepSpeed = useStore((s) => s.sweepSpeed);
  const autoAssistMs = useStore((s) => s.autoAssistMs);

  const player = players[currentPlayerIndex];
  return useMemo(() => ({
    oneTouch: player?.oneTouchMode ?? oneTouchMode,
    bumpers: player?.bumpersEnabled ?? bumpersEnabled,
    sweepSpeed: player?.sweepSpeed ?? sweepSpeed,
    autoAssistMs: player?.autoAssistMs ?? autoAssistMs,
  }), [player, oneTouchMode, bumpersEnabled, sweepSpeed, autoAssistMs]);
}

/** Non-reactive equivalent, for use inside useFrame and event handlers. */
export function getActiveSettings(): ActiveSettings {
  const s = useStore.getState();
  return resolveSettings(s.players[s.currentPlayerIndex], s);
}

// --- Persist teacher settings across sessions ---------------------------------
let saveTimer: number | undefined;
useStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveSettings({
      sweepSpeed: state.sweepSpeed,
      oneTouchMode: state.oneTouchMode,
      bumpersEnabled: state.bumpersEnabled,
      totalFrames: state.totalFrames,
      autoAssistMs: state.autoAssistMs,
      switchHoldMs: state.switchHoldMs,
      switchCooldownMs: state.switchCooldownMs,
      switchAcceptsAnyKey: state.switchAcceptsAnyKey,
      teacherAdvanceRequired: state.teacherAdvanceRequired,
      reduceMotion: state.reduceMotion,
      bgmVolume: state.bgmVolume,
      sfxVolume: state.sfxVolume,
      currentStationIndex: state.currentStationIndex,
    });
  }, 400);
});

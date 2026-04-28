import { create } from 'zustand';

export type GameState = 'menu' | 'setup' | 'playing' | 'results';
export type PlayState = 'idle' | 'spin' | 'aiming' | 'power' | 'rolling' | 'scoring';
export type GameMode = 'single' | 'class';

export interface Player {
  id: string;
  name: string;
}

export interface Frame {
  roll1: number | null;
  roll2: number | null;
  roll3: number | null;
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
        const next = frames[i+1];
        if (next && next.roll1 !== null) {
          score += next.roll1;
          if (next.roll1 === 10 && i < totalFrames - 2) {
            const nextNext = frames[i+2];
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
        const next = frames[i+1];
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
  
  currentPlayerIndex: number;
  playerFrames: Record<string, Frame[]>;
  currentFrame: number;
  currentRoll: 1 | 2 | 3;
  
  teacherAdvancePending: boolean;
  setTeacherAdvancePending: (pending: boolean) => void;
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

  pinResetTrigger: number;
  triggerPinReset: () => void;

  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  
  bgmVolume: number;
  setBgmVolume: (vol: number) => void;
  sfxVolume: number;
  setSfxVolume: (vol: number) => void;
  currentStationIndex: number;
  setCurrentStationIndex: (index: number) => void;

  startGame: (singlePlayerName?: string) => void;
  advanceRoll: (pinsDownThisRoll: number) => void;
  resetGame: () => void;
}

export const useStore = create<BowlingStore>((set, get) => ({
  gameState: 'menu',
  setGameState: (state) => set({ gameState: state }),
  gameMode: 'class',
  setGameMode: (mode) => set({ gameMode: mode }),
  
  bumpersEnabled: false,
  setBumpersEnabled: (enabled) => set({ bumpersEnabled: enabled }),

  totalFrames: 10,
  setTotalFrames: (frames) => set({ totalFrames: frames }),

  players: [],
  addPlayer: (name) => set((state) => ({
    players: [...state.players, { id: Math.random().toString(36).substring(7), name }]
  })),
  removePlayer: (id) => set((state) => ({
    players: state.players.filter(p => p.id !== id)
  })),

  currentPlayerIndex: 0,
  playerFrames: {},
  currentFrame: 0,
  currentRoll: 1,
  
  teacherAdvancePending: false,
  setTeacherAdvancePending: (pending) => set({ teacherAdvancePending: pending }),

  sweepSpeed: 0.75,
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

  pinResetTrigger: 0,
  triggerPinReset: () => set((state) => ({ pinResetTrigger: state.pinResetTrigger + 1 })),
  isPaused: false,
  setPaused: (paused) => set({ isPaused: paused }),
  bgmVolume: 0.5,
  setBgmVolume: (vol) => set({ bgmVolume: vol }),
  sfxVolume: 0.8,
  setSfxVolume: (vol) => set({ sfxVolume: vol }),
  currentStationIndex: 0,
  setCurrentStationIndex: (index: number) => set({ currentStationIndex: index }),

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

    set({
      players,
      playerFrames,
      currentPlayerIndex: 0,
      currentFrame: 0,
      currentRoll: 1,
      gameState: 'playing',
      playState: 'spin',
      spinAmount: 0,
      teacherAdvancePending: false,
      pinsDown: 0
    });
  },

  nextPlayer: () => {
    const state = get();
    const nextIdx = state.currentPlayerIndex + 1;
    
    if (nextIdx < state.players.length) {
      set({
        currentPlayerIndex: nextIdx,
        currentRoll: 1,
        teacherAdvancePending: false,
        playState: 'spin',
        spinAmount: 0,
        pinsDown: 0
      });
    } else {
      const nextFrame = state.currentFrame + 1;
      if (nextFrame < state.totalFrames) {
        set({
          currentPlayerIndex: 0,
          currentFrame: nextFrame,
          currentRoll: 1,
          teacherAdvancePending: false,
          playState: 'spin',
          spinAmount: 0,
          pinsDown: 0
        });
      } else {
        set({ gameState: 'results', teacherAdvancePending: false, playState: 'idle' });
      }
    }
  },

  advanceRoll: (pinsDownThisRoll) => {
    const state = get();
    const playerId = state.players[state.currentPlayerIndex].id;
    const frames = [...state.playerFrames[playerId]];
    const frame = { ...frames[state.currentFrame] };
    
    let nextFrame = state.currentFrame;
    let nextRoll = state.currentRoll;
    let isTurnOver = false;
    
    if (state.currentFrame < state.totalFrames - 1) {
      if (state.currentRoll === 1) {
        frame.roll1 = pinsDownThisRoll;
        if (pinsDownThisRoll === 10) {
           isTurnOver = true;
        } else {
           nextRoll = 2;
        }
      } else {
        frame.roll2 = pinsDownThisRoll;
        isTurnOver = true;
      }
    } else {
      // Last frame
      if (state.currentRoll === 1) {
        frame.roll1 = pinsDownThisRoll;
        nextRoll = 2;
      } else if (state.currentRoll === 2) {
        frame.roll2 = pinsDownThisRoll;
        if (frame.roll1 === 10 || frame.roll1 + frame.roll2 === 10) {
          nextRoll = 3;
        } else {
          isTurnOver = true;
        }
      } else {
        frame.roll3 = pinsDownThisRoll;
        isTurnOver = true;
      }
    }
    
    frames[state.currentFrame] = frame;
    
    if (isTurnOver) {
      if (state.gameMode === 'class' || state.players.length > 1) {
        set({ playerFrames: { ...state.playerFrames, [playerId]: frames }, teacherAdvancePending: true, playState: 'idle' });
        return;
      } else {
        if (state.currentFrame < state.totalFrames - 1) {
          nextFrame++;
          nextRoll = 1;
        } else {
          // Game over for this player
          set({ playerFrames: { ...state.playerFrames, [playerId]: frames }, gameState: 'results', playState: 'idle' });
          return;
        }
      }
    }
    
    set({ 
      playerFrames: { ...state.playerFrames, [playerId]: frames }, 
      currentFrame: nextFrame, 
      currentRoll: nextRoll as 1 | 2 | 3,
      playState: 'idle'
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
    playState: 'idle',
    spinAmount: 0,
    pinsDown: 0,
    pinResetTrigger: state.pinResetTrigger + 1
  }))
}));

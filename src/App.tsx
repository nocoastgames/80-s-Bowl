import { Canvas } from '@react-three/fiber';
import { Scene } from './components/game/Scene';
import { MainMenu } from './components/ui/MainMenu';
import { TournamentSetup } from './components/ui/TournamentSetup';
import { GameplayOverlay } from './components/ui/GameplayOverlay';
import { Results } from './components/ui/Results';
import { PauseMenu } from './components/ui/PauseMenu';
import { useStore } from './store';
import { audioEngine } from './lib/audio';
import { useEffect } from 'react';

/** True when the user is typing, so shortcuts must not steal the keystroke. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

export default function App() {
  const gameState = useStore((state) => state.gameState);
  const setPaused = useStore((state) => state.setPaused);
  const reduceMotion = useStore((state) => state.reduceMotion);

  // Drive the reduced-motion CSS from a class on <html> so plain CSS
  // animations can be switched off alongside the React-driven ones.
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useStore.getState();

      if (e.key === 'Escape' || e.code === 'Escape') {
        if (state.gameState === 'playing') {
          setPaused(!state.isPaused);
        }
        return;
      }

      // Number keys switch radio stations — but not while someone is typing a
      // player name. Adding "Player 1" to the roster used to change the station
      // partway through the word.
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      let parsedNum = -1;
      if (e.code && e.code.startsWith('Digit')) {
        parsedNum = parseInt(e.code.replace('Digit', ''));
      } else if (e.code && e.code.startsWith('Numpad')) {
        const np = e.code.replace('Numpad', '');
        if (np >= '0' && np <= '9') parsedNum = parseInt(np);
      } else if (typeof e.key === 'string' && e.key >= '0' && e.key <= '9') {
        parsedNum = parseInt(e.key);
      }

      if (parsedNum === -1 || Number.isNaN(parsedNum)) return;

      const stationIndex = parsedNum - 1; // 0 becomes -1, i.e. radio off
      state.setCurrentStationIndex(stationIndex);
      if (state.gameState === 'playing') {
        if (stationIndex === -1) {
          audioEngine.stopBGM();
        } else {
          audioEngine.playBGM(stationIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setPaused]);

  return (
    <div className="w-full h-screen bg-slate-950 overflow-hidden relative font-sans select-none">
      {/* 3D Scene - Always rendered, but camera/logic changes based on state */}
      <Canvas shadows>
        <Scene />
      </Canvas>

      {/* UI Overlays */}
      {gameState === 'menu' && <MainMenu />}
      {gameState === 'setup' && <TournamentSetup />}
      {gameState === 'playing' && <GameplayOverlay />}
      {gameState === 'results' && <Results />}

      <PauseMenu />
    </div>
  );
}

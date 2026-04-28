import { Canvas } from '@react-three/fiber';
import { Scene } from './components/game/Scene';
import { MainMenu } from './components/ui/MainMenu';
import { TournamentSetup } from './components/ui/TournamentSetup';
import { GameplayOverlay } from './components/ui/GameplayOverlay';
import { Results } from './components/ui/Results';
import { PauseMenu } from './components/ui/PauseMenu';
import { useStore } from './store';
import { useEffect } from 'react';

export default function App() {
  const gameState = useStore((state) => state.gameState);
  const setPaused = useStore((state) => state.setPaused);
  const isPaused = useStore((state) => state.isPaused);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useStore.getState();
      
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (state.gameState === 'playing') {
          setPaused(!state.isPaused);
        }
      }
      
      let parsedNum = -1;
      if (e.code && e.code.startsWith('Digit')) {
        parsedNum = parseInt(e.code.replace('Digit', ''));
      } else if (e.code && e.code.startsWith('Numpad')) {
        const np = e.code.replace('Numpad', '');
        if (np >= '0' && np <= '9') parsedNum = parseInt(np);
      } else if (typeof e.key === 'string' && e.key >= '0' && e.key <= '9') {
        parsedNum = parseInt(e.key);
      }

      if (parsedNum !== -1) {
        const stationIndex = parsedNum - 1; // 0 becomes -1
        state.setCurrentStationIndex(stationIndex);
        if (state.gameState === 'playing') {
           // update audio engine stream immediately if playing
           import('./lib/audio').then(({ audioEngine }) => {
               if (stationIndex === -1) {
                   audioEngine.stopBGM();
               } else {
                   audioEngine.playBGM(stationIndex);
               }
           });
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

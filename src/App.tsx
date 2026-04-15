import { Canvas } from '@react-three/fiber';
import { Scene } from './components/game/Scene';
import { MainMenu } from './components/ui/MainMenu';
import { TournamentSetup } from './components/ui/TournamentSetup';
import { GameplayOverlay } from './components/ui/GameplayOverlay';
import { Results } from './components/ui/Results';
import { useStore } from './store';

export default function App() {
  const gameState = useStore((state) => state.gameState);

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
    </div>
  );
}

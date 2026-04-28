import { useStore } from '../../store';

export function MainMenu() {
  const { setGameState, sweepSpeed, setSweepSpeed, setGameMode } = useStore();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-dark text-white p-8">
      <h1 className="text-6xl font-black tracking-tight mb-4 text-center text-accent drop-shadow-[0_0_20px_rgba(0,242,255,0.4)]">SWITCH STRIKE<br/><span className="text-white">BOWLING</span></h1>
      <p className="text-2xl text-[#aaa] mb-12 text-center max-w-2xl">
        A single-switch accessible 3D bowling game.
      </p>

      <div className="flex gap-6 mb-12">
        <button 
          className="bg-panel p-8 rounded border-l-4 border-accent hover:bg-white/10 transition-colors"
          onClick={(e) => { e.stopPropagation(); setGameMode('single'); setGameState('setup'); }}
        >
          <p className="text-3xl font-bold text-accent">Single Player</p>
        </button>
        <button 
          className="bg-panel p-8 rounded border-l-4 border-warn hover:bg-white/10 transition-colors"
          onClick={(e) => { e.stopPropagation(); setGameMode('class'); setGameState('setup'); }}
        >
          <p className="text-3xl font-bold text-warn">Class Mode</p>
        </button>
      </div>

      <div className="flex items-center gap-4 bg-panel p-4 rounded border border-white/10">
        <span className="font-medium text-accent uppercase tracking-[1px] text-[12px]">Game Speed:</span>
        <button 
          className={`px-4 py-2 rounded font-bold ${sweepSpeed === 0.5 ? 'bg-accent text-black' : 'bg-white/10'}`}
          onClick={(e) => { e.stopPropagation(); setSweepSpeed(0.5); }}
        >
          Slow
        </button>
        <button 
          className={`px-4 py-2 rounded font-bold ${sweepSpeed === 0.75 ? 'bg-accent text-black' : 'bg-white/10'}`}
          onClick={(e) => { e.stopPropagation(); setSweepSpeed(0.75); }}
        >
          Normal
        </button>
        <button 
          className={`px-4 py-2 rounded font-bold ${sweepSpeed === 1.0 ? 'bg-accent text-black' : 'bg-white/10'}`}
          onClick={(e) => { e.stopPropagation(); setSweepSpeed(1.0); }}
        >
          Fast
        </button>
      </div>
    </div>
  );
}

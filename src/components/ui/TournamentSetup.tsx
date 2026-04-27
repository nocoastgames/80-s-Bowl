import { useState } from 'react';
import { useStore } from '../../store';

export function TournamentSetup() {
  const { gameMode, players, addPlayer, removePlayer, startGame, setGameState, bumpersEnabled, setBumpersEnabled, totalFrames, setTotalFrames } = useStore();
  const [name, setName] = useState('');

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const playerName = name.trim() || `Player ${players.length + 1}`;
    
    if (gameMode === 'single') {
      startGame(playerName);
    } else if (players.length < 32) {
      addPlayer(playerName);
      setName('');
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center bg-bg-dark text-white p-8 overflow-y-auto">
      <div className="w-full max-w-4xl">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-4xl font-black tracking-tight text-accent drop-shadow-[0_0_10px_rgba(0,242,255,0.4)]">
            {gameMode === 'single' ? 'Single Player Setup' : 'Class Mode Setup'}
          </h2>
          <button 
            onClick={() => setGameState('menu')}
            className="px-6 py-3 bg-panel border border-white/10 hover:bg-white/10 rounded font-bold text-xl transition-colors"
          >
            Back
          </button>
        </div>

        <div className={`grid grid-cols-1 ${gameMode === 'class' ? 'md:grid-cols-2' : ''} gap-8`}>
          <div className="bg-panel p-6 rounded border-l-4 border-accent">
            <h3 className="text-2xl font-bold mb-4">
              {gameMode === 'single' ? 'Enter Player Name' : `Add Player (${players.length}/32)`}
            </h3>
            <form onSubmit={handleAdd} className="flex gap-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Player ${players.length + 1}`}
                className="flex-1 bg-bg-dark border border-white/20 rounded px-4 py-3 text-xl focus:border-accent focus:outline-none"
                maxLength={20}
              />
              <button 
                type="submit"
                disabled={gameMode === 'class' && players.length >= 32}
                className="px-6 py-3 bg-accent text-black hover:bg-accent/80 disabled:opacity-50 rounded font-bold text-xl transition-colors"
              >
                {gameMode === 'single' ? 'Start Game' : 'Add'}
              </button>
            </form>

            <div className="mt-8 flex items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={bumpersEnabled}
                  onChange={(e) => setBumpersEnabled(e.target.checked)}
                  className="w-6 h-6 accent-accent"
                />
                <span className="text-xl font-medium">Enable Bumpers</span>
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <label className="text-xl font-medium">Number of Frames: {totalFrames}</label>
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={totalFrames}
                onChange={(e) => setTotalFrames(parseInt(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            {gameMode === 'class' && (
              <button
                onClick={() => startGame()}
                disabled={players.length < 1}
                className="w-full mt-8 px-6 py-4 bg-[#00ff00] text-black hover:bg-[#00cc00] disabled:opacity-50 rounded font-black text-2xl transition-colors"
              >
                Start Class Game
              </button>
            )}
          </div>

          {gameMode === 'class' && (
            <div className="bg-panel p-6 rounded border border-white/10 max-h-[60vh] overflow-y-auto">
              <h3 className="text-2xl font-bold mb-4">Players</h3>
              {players.length === 0 ? (
                <p className="text-[#888] text-lg">No players added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {players.map((p, i) => (
                    <li key={p.id} className="flex justify-between items-center bg-white/5 p-4 rounded border border-white/10">
                      <span className="text-xl font-medium">{i + 1}. {p.name}</span>
                      <button 
                        onClick={() => removePlayer(p.id)}
                        className="text-[#ff3b3b] hover:text-[#ff0000] font-bold p-2"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useStore } from '../../store';
import { audioEngine } from '../../lib/audio';

export function PauseMenu() {
  const { 
    isPaused, 
    setPaused, 
    bumpersEnabled, 
    setBumpersEnabled,
    bgmVolume,
    setBgmVolume,
    sfxVolume,
    setSfxVolume,
    triggerPinReset,
    resetGame,
    setPlayState,
    nextPlayer
  } = useStore();

  if (!isPaused) return null;

  const handleReturnToMenu = () => {
    setPaused(false);
    audioEngine.stopBGM();
    resetGame();
  };

  const handleSkipBowler = () => {
    setPaused(false);
    nextPlayer();
  };

  const handleBgmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setBgmVolume(val);
    audioEngine.setBgmVolume(val);
  };

  const handleSfxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSfxVolume(val);
    audioEngine.setSfxVolume(val);
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-panel border-4 border-accent p-8 rounded-xl max-w-md w-full shadow-[0_0_50px_rgba(0,255,0,0.2)]">
        <h2 className="text-4xl font-black text-center text-accent mb-8 uppercase tracking-widest">Paused</h2>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold">Bumpers</span>
            <button 
              onClick={() => setBumpersEnabled(!bumpersEnabled)}
              className={`px-4 py-2 font-bold rounded ${bumpersEnabled ? 'bg-accent text-black' : 'bg-white/10 text-white'}`}
            >
              {bumpersEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xl font-bold">Reset Pins</span>
            <button 
              onClick={() => {
                triggerPinReset();
                setPaused(false);
              }}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 font-bold rounded transition-colors"
            >
              Reset Physics
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xl font-bold">Music Volume</span>
              <span className="text-accent">{Math.round(bgmVolume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
              value={bgmVolume}
              onChange={handleBgmChange}
              className="w-full accent-accent"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xl font-bold">Effects Volume</span>
              <span className="text-accent">{Math.round(sfxVolume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05"
              value={sfxVolume}
              onChange={handleSfxChange}
              className="w-full accent-accent"
            />
          </div>

          <div className="pt-6 border-t border-white/20 space-y-3">
            <button 
              onClick={handleSkipBowler}
              className="w-full bg-warn hover:bg-white text-black py-3 rounded font-black uppercase tracking-wider transition-colors"
            >
              Skip Bowler
            </button>
            <button 
              onClick={handleReturnToMenu}
              className="w-full bg-panel border-2 border-warn hover:bg-warn hover:text-black py-3 rounded font-black uppercase tracking-wider transition-colors"
            >
              Return to Menu
            </button>
            <button 
              onClick={() => setPaused(false)}
              className="w-full bg-accent hover:bg-white text-black py-4 rounded font-black text-xl uppercase tracking-wider transition-colors shadow-[0_0_20px_rgba(0,255,0,0.4)]"
            >
              Resume Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useStore } from '../../store';
import { audioEngine, RADIO_STATIONS } from '../../lib/audio';
import { AccessibilityPanel } from './AccessibilityPanel';
import { PlayerOverrides, playerHasOverrides } from './PlayerOverrides';

export function PauseMenu() {
  const isPaused = useStore((s) => s.isPaused);
  const setPaused = useStore((s) => s.setPaused);
  const bgmVolume = useStore((s) => s.bgmVolume);
  const setBgmVolume = useStore((s) => s.setBgmVolume);
  const sfxVolume = useStore((s) => s.sfxVolume);
  const setSfxVolume = useStore((s) => s.setSfxVolume);
  const triggerPinReset = useStore((s) => s.triggerPinReset);
  const resetGame = useStore((s) => s.resetGame);
  const nextPlayer = useStore((s) => s.nextPlayer);
  const currentStationIndex = useStore((s) => s.currentStationIndex);
  const setCurrentStationIndex = useStore((s) => s.setCurrentStationIndex);
  const undoLastRoll = useStore((s) => s.undoLastRoll);
  const canUndo = useStore((s) => s.history.length > 0);
  const players = useStore((s) => s.players);
  const currentPlayerIndex = useStore((s) => s.currentPlayerIndex);
  const updatePlayer = useStore((s) => s.updatePlayer);

  const [showSettings, setShowSettings] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!isPaused) return null;

  const currentPlayer = players[currentPlayerIndex];

  const handleReturnToMenu = () => {
    setPaused(false);
    audioEngine.stopBGM();
    resetGame();
  };

  const handleSkipBowler = () => {
    setPaused(false);
    nextPlayer();
  };

  const handleUndo = () => {
    undoLastRoll();
    setPaused(false);
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

  if (showSettings) {
    return (
      <div className="absolute inset-0 z-50 bg-black/90 flex items-start justify-center p-6 overflow-y-auto custom-scrollbar">
        <div className="bg-panel border-4 border-accent rounded-xl p-6 max-w-5xl w-full my-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-black text-accent uppercase tracking-widest">
              Accessibility &amp; Controls
            </h2>
            <button
              onClick={() => setShowSettings(false)}
              className="px-6 py-3 bg-accent text-black hover:bg-white rounded font-black uppercase tracking-wider transition-colors"
            >
              Done
            </button>
          </div>
          <AccessibilityPanel />
          <p className="text-[#888] text-sm mt-6">
            Changes apply on the next turn. Settings a student has customised on the
            setup screen still win over these.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="bg-panel border-4 border-accent p-8 rounded-xl max-w-md w-full shadow-[0_0_50px_rgba(0,255,0,0.2)] my-4">
        <h2 className="text-4xl font-black text-center text-accent mb-2 uppercase tracking-widest">Paused</h2>
        {currentPlayer && (
          <p className="text-center text-[#aaa] mb-8">{currentPlayer.name} is up</p>
        )}

        <div className="space-y-6">
          {/* Per-student settings for whoever is up, so a student who is
              struggling can be given bumpers mid-game without changing anything
              for the rest of the class. Takes effect on their next turn. */}
          {currentPlayer && (
            <div className="bg-black/40 border border-white/10 rounded-lg p-4">
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <span className="text-accent uppercase tracking-[1px] text-[12px] font-bold">
                  Just for {currentPlayer.name}
                </span>
                {playerHasOverrides(currentPlayer) && (
                  <span className="text-[11px] uppercase tracking-[1px] text-[#00ff00]">custom</span>
                )}
              </div>
              <p className="text-[#9aa] text-sm mb-3">
                Applies to this student only. Everyone else keeps the class settings.
              </p>
              <PlayerOverrides
                player={currentPlayer}
                onUpdate={(patch) => updatePlayer(currentPlayer.id, patch)}
              />
            </div>
          )}

          <button
            onClick={() => setShowSettings(true)}
            className="w-full bg-white/10 hover:bg-white/20 border-2 border-accent py-3 rounded font-black uppercase tracking-wider transition-colors"
          >
            Class Settings (everyone)
          </button>

          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xl font-bold block">Undo last roll</span>
              <span className="text-[#888] text-sm">Fixes a misfire or an accidental press</span>
            </div>
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 text-white px-4 py-2 font-bold rounded transition-colors whitespace-nowrap"
            >
              Undo
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-xl font-bold block">Reset pins</span>
              <span className="text-[#888] text-sm">If the physics gets stuck</span>
            </div>
            <button
              onClick={() => {
                triggerPinReset();
                setPaused(false);
              }}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 font-bold rounded transition-colors whitespace-nowrap"
            >
              Reset
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="pause-station" className="text-xl font-bold block">Radio Station</label>
            <select
              id="pause-station"
              value={currentStationIndex}
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                setCurrentStationIndex(idx);
                if (idx === -1) {
                  audioEngine.stopBGM();
                } else {
                  audioEngine.playBGM(idx);
                }
              }}
              className="w-full bg-bg-dark border border-white/20 rounded px-4 py-2 text-lg focus:border-accent focus:outline-none"
            >
              <option value={-1}>0. OFF</option>
              {RADIO_STATIONS.map((station, i) => (
                <option key={i} value={i}>
                  {i + 1}. {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <label htmlFor="bgm-vol" className="text-xl font-bold">Music Volume</label>
              <span className="text-accent">{Math.round(bgmVolume * 100)}%</span>
            </div>
            <input
              id="bgm-vol"
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
              <label htmlFor="sfx-vol" className="text-xl font-bold">Effects Volume</label>
              <span className="text-accent">{Math.round(sfxVolume * 100)}%</span>
            </div>
            <input
              id="sfx-vol"
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

            {confirmEnd ? (
              <div className="space-y-2 bg-black/40 p-3 rounded border border-white/20">
                <p className="text-center text-sm text-[#ddd]">
                  End the game now and go to the results?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPaused(false);
                      setConfirmEnd(false);
                      audioEngine.stopBGM();
                      useStore.setState({ gameState: 'results', playState: 'idle' });
                    }}
                    className="flex-1 bg-[#ff00ff] hover:bg-white text-white hover:text-black py-2 rounded font-black uppercase tracking-wider transition-colors"
                  >
                    Yes, end it
                  </button>
                  <button
                    onClick={() => setConfirmEnd(false)}
                    className="flex-1 bg-white/10 hover:bg-white/20 py-2 rounded font-bold uppercase tracking-wider transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEnd(true)}
                className="w-full bg-[#ff00ff] hover:bg-white text-white hover:text-black py-3 rounded font-black uppercase tracking-wider transition-colors"
              >
                End Game
              </button>
            )}

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

import { useState } from 'react';
import { useStore } from '../../store';
import { AccessibilityPanel } from './AccessibilityPanel';

export function MainMenu() {
  const setGameState = useStore((s) => s.setGameState);
  const setGameMode = useStore((s) => s.setGameMode);
  const oneTouchMode = useStore((s) => s.oneTouchMode);
  const sweepSpeed = useStore((s) => s.sweepSpeed);
  const autoAssistMs = useStore((s) => s.autoAssistMs);
  const bumpersEnabled = useStore((s) => s.bumpersEnabled);
  const reduceMotion = useStore((s) => s.reduceMotion);

  const [showSettings, setShowSettings] = useState(false);

  const speedLabel =
    sweepSpeed <= 0.35 ? 'Slow' : sweepSpeed <= 0.5 ? 'Relaxed' : sweepSpeed <= 0.75 ? 'Normal' : 'Fast';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-dark text-white p-8 overflow-y-auto custom-scrollbar">
      <h1 className="text-6xl font-black tracking-tight mb-4 text-center text-accent drop-shadow-[0_0_20px_rgba(0,242,255,0.4)]">
        SWITCH STRIKE<br /><span className="text-white">BOWLING</span>
      </h1>
      <p className="text-2xl text-[#aaa] mb-12 text-center max-w-2xl">
        A single-switch accessible 3D bowling game.
      </p>

      <div className="flex gap-6 mb-10 flex-wrap justify-center">
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

      {/* Current settings at a glance, so a teacher can see what a student is
          about to get without opening the panel. */}
      <div className="bg-panel border border-white/10 rounded-lg px-6 py-4 mb-6 flex flex-wrap gap-x-8 gap-y-2 justify-center max-w-2xl">
        <span className="text-[#aaa]">Control: <strong className="text-white">{oneTouchMode ? '1-Touch' : 'Standard'}</strong></span>
        <span className="text-[#aaa]">Speed: <strong className="text-white">{speedLabel}</strong></span>
        <span className="text-[#aaa]">Bumpers: <strong className="text-white">{bumpersEnabled ? 'On' : 'Off'}</strong></span>
        <span className="text-[#aaa]">Auto-Assist: <strong className="text-white">{autoAssistMs > 0 ? `${autoAssistMs / 1000}s` : 'Off'}</strong></span>
        {/* Reduce Motion belongs here because it turns animations off across
            the whole game and defaults from the operating system, so it can be
            on without anyone having chosen it. Left out of this row, it just
            looks like the animations are broken. */}
        <span className="text-[#aaa]">Reduce Motion: <strong className={reduceMotion ? 'text-warn' : 'text-white'}>{reduceMotion ? 'On' : 'Off'}</strong></span>
      </div>

      {reduceMotion && (
        <p className="text-warn/90 text-sm mb-6 text-center max-w-xl">
          Reduce Motion is on, so animations are turned off &mdash; including the
          pin sweep and reset. It follows your device&rsquo;s animation setting by
          default. Turn it off below to see them.
        </p>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
        className="px-8 py-4 bg-panel border-2 border-accent hover:bg-accent hover:text-black rounded font-bold text-xl uppercase tracking-wider transition-colors"
      >
        Accessibility &amp; Controls
      </button>

      <p className="text-[#666] text-sm mt-8 text-center max-w-xl">
        Settings are saved on this device. Press 1&ndash;9 for a radio station, 0 for silence.
      </p>

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-start justify-center p-6 overflow-y-auto custom-scrollbar">
          <div className="bg-panel border-4 border-accent rounded-xl p-6 max-w-5xl w-full my-8">
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
              These are the class-wide defaults. In Class Mode you can override any of them
              for an individual student from the player list.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

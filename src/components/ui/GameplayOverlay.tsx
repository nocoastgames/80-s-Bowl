import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, calculateTotalScore, useActiveSettings } from '../../store';
import { useSingleSwitch } from '../../hooks/useSingleSwitch';
import { useAutoAssist } from '../../hooks/useAutoAssist';
import { useCurrentSong } from '../../hooks/useCurrentSong';
import { motion } from 'motion/react';
import { audioEngine, RADIO_STATIONS } from '../../lib/audio';
import { sweep, resetSweep } from '../../lib/sweep';
import { Scorecard } from './Scorecard';

const BARS = 32;
const ROWS = 6;
/** EQ refresh interval. 20fps is plenty for a decorative meter and leaves the
 *  frame budget to the physics, which matters on a school Chromebook. */
const EQ_INTERVAL_MS = 50;

const DOT_OFF = 'rgba(0, 242, 255, 0.1)';
const DOT_LOW = '#00ff00';
const DOT_MID = '#facc15';
const DOT_HIGH = '#ef4444';

/**
 * Dot-matrix EQ driven by direct DOM writes rather than React state.
 *
 * The original version called setState with a fresh 32-element array every
 * animation frame, which re-rendered the whole overlay — header, scorecard and
 * all — sixty times a second while the physics was also running.
 */
const DotMatrixEQ = ({ active }: { active: boolean }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const reduceMotion = useStore((s) => s.reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;

    let timer: number;
    const paint = () => {
      const data = active ? audioEngine.getEQData() : null;
      const numBins = data?.length ?? 0;
      const binsPerBar = numBins ? Math.max(1, Math.floor(numBins / BARS)) : 0;

      for (let i = 0; i < BARS; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;

        let level = 0;
        if (data && binsPerBar) {
          let sum = 0;
          let count = 0;
          for (let j = 0; j < binsPerBar; j++) {
            const idx = i * binsPerBar + j;
            if (idx < numBins) {
              sum += data[idx];
              count++;
            }
          }
          level = count ? Math.min(1, (sum / count / 255) * 1.5) : 0;
        } else if (active) {
          // Stream hasn't produced analysable data yet (or is cross-origin
          // blocked) — idle shimmer so the panel doesn't look broken.
          level = Math.random() * 0.8;
        }

        const lit = Math.round(level * ROWS);
        const dots = bar.children;
        for (let r = 0; r < dots.length; r++) {
          const dot = dots[r] as HTMLDivElement;
          if (r < lit) {
            dot.style.backgroundColor =
              r >= Math.floor(ROWS * 0.8) ? DOT_HIGH : r >= Math.floor(ROWS * 0.5) ? DOT_MID : DOT_LOW;
          } else {
            dot.style.backgroundColor = DOT_OFF;
          }
        }
      }
      timer = window.setTimeout(paint, EQ_INTERVAL_MS);
    };
    paint();
    return () => clearTimeout(timer);
  }, [active, reduceMotion]);

  return (
    <div
      className="absolute bottom-1 left-2 right-2 flex items-end justify-between opacity-50 mix-blend-screen pointer-events-none z-0"
      aria-hidden="true"
    >
      {Array.from({ length: BARS }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="flex flex-col-reverse justify-start gap-[2px] h-[36px] w-[8px]"
        >
          {Array.from({ length: ROWS }).map((_, r) => (
            <div key={r} className="w-full h-[4px] rounded-[1px]" style={{ backgroundColor: DOT_OFF }} />
          ))}
        </div>
      ))}
    </div>
  );
};

const CELEBRATIONS = {
  strike: { text: 'STRIKE!', color: '#ffff00', glow: 'rgba(255,255,0,0.6)' },
  spare: { text: 'SPARE!', color: '#00f2ff', glow: 'rgba(0,242,255,0.6)' },
  gutter: { text: 'GUTTER BALL', color: '#ff00ff', glow: 'rgba(255,0,255,0.5)' },
} as const;

export function GameplayOverlay() {
  // Individual selectors: the overlay used to subscribe to the entire store,
  // so every unrelated write re-rendered it.
  const playState = useStore((s) => s.playState);
  const setPlayState = useStore((s) => s.setPlayState);
  const setAimAngle = useStore((s) => s.setAimAngle);
  const setPowerLevel = useStore((s) => s.setPowerLevel);
  const setSpinAmount = useStore((s) => s.setSpinAmount);
  const currentFrame = useStore((s) => s.currentFrame);
  const currentRoll = useStore((s) => s.currentRoll);
  const totalFrames = useStore((s) => s.totalFrames);
  const playerFrames = useStore((s) => s.playerFrames);
  const players = useStore((s) => s.players);
  const currentPlayerIndex = useStore((s) => s.currentPlayerIndex);
  const teacherAdvancePending = useStore((s) => s.teacherAdvancePending);
  const advanceReady = useStore((s) => s.advanceReady);
  const teacherAdvanceRequired = useStore((s) => s.teacherAdvanceRequired);
  const nextPlayer = useStore((s) => s.nextPlayer);
  const undoLastRoll = useStore((s) => s.undoLastRoll);
  const canUndo = useStore((s) => s.history.length > 0);
  const isPaused = useStore((s) => s.isPaused);
  const currentStationIndex = useStore((s) => s.currentStationIndex);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const switchHoldMs = useStore((s) => s.switchHoldMs);
  const switchCooldownMs = useStore((s) => s.switchCooldownMs);
  const switchAcceptsAnyKey = useStore((s) => s.switchAcceptsAnyKey);
  const lastOutcome = useStore((s) => s.lastOutcome);
  const pinsDown = useStore((s) => s.pinsDown);

  const { oneTouch, sweepSpeed, autoAssistMs } = useActiveSettings();

  // Elements the sweep loop writes to directly.
  const spinKnobRef = useRef<HTMLDivElement>(null);
  const powerFillRef = useRef<HTMLDivElement>(null);
  const holdBarRef = useRef<HTMLDivElement>(null);
  const assistBarRef = useRef<HTMLDivElement>(null);

  const posDir = useRef(1);
  const aimDir = useRef(1);
  const powerDir = useRef(1);

  /** Bumped on every accepted switch press, to restart the Auto-Assist clock. */
  const [pressTick, setPressTick] = useState(0);

  const isSweeping = playState === 'spin' || playState === 'aiming' || playState === 'power';

  // Every stage starts from its neutral value. This has to cover 'aiming' and
  // 'power' too, not just 'spin': in 1-Touch mode the turn begins at 'aiming'
  // and the sweep would otherwise start wherever the previous roll left it.
  useEffect(() => {
    if (isSweeping) {
      resetSweep();
      posDir.current = 1;
      aimDir.current = 1;
      powerDir.current = 1;
    }
  }, [playState, isSweeping]);

  // Sweep loop. Writes to the shared `sweep` object and straight to the DOM;
  // no React state is touched, so this costs nothing in renders.
  useEffect(() => {
    if (!isSweeping) return;

    let animationFrame: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      if (useStore.getState().isPaused) {
        animationFrame = requestAnimationFrame(loop);
        return;
      }

      if (playState === 'spin') {
        let next = sweep.spin + delta * 2.0 * sweepSpeed * posDir.current;
        if (next > 1) { next = 1; posDir.current = -1; }
        else if (next < -1) { next = -1; posDir.current = 1; }
        sweep.spin = next;
        if (spinKnobRef.current) {
          spinKnobRef.current.style.left = `${((next + 1) / 2) * 100}%`;
        }
      } else if (playState === 'aiming') {
        let next = sweep.aim + delta * 0.4 * sweepSpeed * aimDir.current;
        if (next > 0.2) { next = 0.2; aimDir.current = -1; }
        else if (next < -0.2) { next = -0.2; aimDir.current = 1; }
        sweep.aim = next;
      } else if (playState === 'power') {
        let next = sweep.power + delta * 100 * sweepSpeed * powerDir.current;
        if (next > 100) { next = 100; powerDir.current = -1; }
        else if (next < 0) { next = 0; powerDir.current = 1; }
        sweep.power = next;
        if (powerFillRef.current) {
          powerFillRef.current.style.height = `${next}%`;
        }
      }

      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [isSweeping, playState, sweepSpeed]);

  const currentPlayer = players[currentPlayerIndex];
  const currentFrames = currentPlayer ? playerFrames[currentPlayer.id] || [] : [];
  const currentScore = useMemo(
    () => calculateTotalScore(currentFrames, totalFrames),
    [currentFrames, totalFrames]
  );

  const switchActive = isSweeping && !teacherAdvancePending && !isPaused;

  /** Last accepted action, shared by the switch and Auto-Assist. */
  const lastActionAt = useRef(0);

  const handleSwitch = useCallback(() => {
    const state = useStore.getState();
    if (state.isPaused || state.teacherAdvancePending) return;

    // Auto-Assist bypasses the switch's own cooldown, so guard here too —
    // otherwise a press landing at the same moment as the auto-fire would
    // advance two stages at once.
    const now = performance.now();
    if (now - lastActionAt.current < 150) return;
    lastActionAt.current = now;

    // First interaction is what unlocks audio playback in the browser.
    audioEngine.playBGM(state.currentStationIndex);
    setPressTick((t) => t + 1);

    if (state.playState === 'spin') {
      setSpinAmount(sweep.spin);
      setPlayState('aiming');
    } else if (state.playState === 'aiming') {
      setAimAngle(sweep.aim);
      if (oneTouch) {
        // One-touch skips the spin and power stages entirely: aim is the only
        // decision, and power is fixed at a value that reliably reaches the pins.
        setSpinAmount(0);
        setPowerLevel(90);
        setPlayState('rolling');
      } else {
        setPlayState('power');
      }
    } else if (state.playState === 'power') {
      setPowerLevel(sweep.power);
      setPlayState('rolling');
    }
  }, [oneTouch, setPlayState, setAimAngle, setPowerLevel, setSpinAmount]);

  useSingleSwitch(handleSwitch, {
    enabled: switchActive,
    cooldownMs: switchCooldownMs,
    holdMs: switchHoldMs,
    acceptAnyKey: switchAcceptsAnyKey,
    onHoldProgress: (p) => {
      if (holdBarRef.current) holdBarRef.current.style.width = `${p * 100}%`;
    },
  });

  useAutoAssist(
    switchActive,
    autoAssistMs,
    handleSwitch,
    `${playState}:${pressTick}`,
    (remaining) => {
      if (assistBarRef.current) {
        assistBarRef.current.style.width = autoAssistMs > 0 ? `${(remaining / autoAssistMs) * 100}%` : '0%';
      }
    }
  );

  // --- Celebration banner -----------------------------------------------------
  const [celebration, setCelebration] = useState<keyof typeof CELEBRATIONS | null>(null);
  const lastOutcomeId = useRef<number | null>(null);

  useEffect(() => {
    if (!lastOutcome || lastOutcome.id === lastOutcomeId.current) return;
    lastOutcomeId.current = lastOutcome.id;

    if (lastOutcome.type === 'strike' || lastOutcome.type === 'spare') {
      audioEngine.playCelebration(lastOutcome.type);
      setCelebration(lastOutcome.type);
    } else if (lastOutcome.type === 'gutter') {
      setCelebration('gutter');
    } else {
      return;
    }

    const timer = setTimeout(() => setCelebration(null), 2200);
    return () => clearTimeout(timer);
  }, [lastOutcome]);

  // Safety net. The advance prompt is armed by the scene once the rack reset
  // finishes; if that ever fails to land, a teacher would be left mid-game with
  // no way to move on. Arm it anyway after a few seconds.
  useEffect(() => {
    if (!teacherAdvancePending || advanceReady) return;
    const timer = setTimeout(() => useStore.getState().setAdvanceReady(true), 4000);
    return () => clearTimeout(timer);
  }, [teacherAdvancePending, advanceReady]);

  const stationName = currentStationIndex === -1 ? 'OFF' : RADIO_STATIONS[currentStationIndex]?.name || 'OFF';
  const isAudioActive = !isPaused && currentStationIndex !== -1 && audioEngine.isPlayingBgm;
  const songText = useCurrentSong(currentStationIndex);

  const [eqOpacity, setEqOpacity] = useState(1);
  const opacityTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    audioEngine.playBGM(useStore.getState().currentStationIndex);
  }, []);

  useEffect(() => {
    setEqOpacity(1);
    if (opacityTimeoutRef.current) clearTimeout(opacityTimeoutRef.current);
    opacityTimeoutRef.current = window.setTimeout(() => setEqOpacity(0.5), 4000);
    return () => {
      if (opacityTimeoutRef.current) clearTimeout(opacityTimeoutRef.current);
    };
  }, [currentStationIndex, songText]);

  // --- Prompt text ------------------------------------------------------------
  const prompt = teacherAdvancePending
    ? advanceReady
      ? teacherAdvanceRequired
        ? 'Waiting for Teacher'
        : 'Next player coming up'
      : 'Nice bowling!'
    : playState === 'idle' ? 'Get ready'
    : playState === 'spin' ? 'Press your switch to set the spin'
    : playState === 'aiming' ? (oneTouch ? 'Press your switch to bowl' : 'Press your switch to set your aim')
    : playState === 'power' ? 'Press your switch to set the power'
    : playState === 'rolling' ? 'Rolling'
    : 'Counting the pins';

  const isLastTurnOfGame =
    currentFrame === totalFrames - 1 && currentPlayerIndex === players.length - 1;
  const upNext = players[(currentPlayerIndex + 1) % players.length];

  /**
   * Spoken announcement. Screen readers get the whole situation — who is up,
   * which frame, what just happened and what to do — not just the prompt.
   */
  const announcement = teacherAdvancePending
    ? `${currentPlayer?.name} knocked down ${pinsDown} ${pinsDown === 1 ? 'pin' : 'pins'}. Score ${currentScore}. Waiting for the teacher to continue.`
    : `${currentPlayer?.name}, frame ${currentFrame + 1} of ${totalFrames}, roll ${currentRoll}. ${prompt}.`;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Top Bar */}
      <header className="h-[80px] bg-gradient-to-b from-header-bg to-transparent flex justify-between items-center px-10 z-10 w-full">
        <div className="flex gap-5 flex-1">
          <div className="bg-panel border-l-4 border-accent px-5 py-2.5 rounded">
            <div className="text-[12px] uppercase tracking-[1px] text-accent">Current Player</div>
            <div className="text-[24px] font-bold">{currentPlayer?.name || 'Player'}</div>
          </div>
          <div className="bg-panel border-l-4 border-accent px-5 py-2.5 rounded">
            <div className="text-[12px] uppercase tracking-[1px] text-accent">Frame</div>
            <div className="text-[24px] font-bold">{currentFrame + 1} / {totalFrames}</div>
          </div>
          <div className="bg-panel border-l-4 border-accent px-5 py-2.5 rounded">
            <div className="text-[12px] uppercase tracking-[1px] text-accent">Score</div>
            {reduceMotion ? (
              <div className="text-[24px] font-bold">{currentScore}</div>
            ) : (
              <motion.div
                key={currentScore}
                initial={{ scale: 1.5, color: '#00f2ff' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="text-[24px] font-bold"
              >
                {currentScore}
              </motion.div>
            )}
          </div>
        </div>

        {/* Center Digital EQ */}
        <div
          className="flex-none flex flex-col items-center justify-center bg-black/80 border-2 border-accent/40 rounded-lg px-2 py-1 w-[380px] h-[60px] overflow-hidden relative shadow-[inset_0_0_15px_rgba(0,242,255,0.2)] transition-opacity duration-1000"
          style={{ opacity: eqOpacity }}
        >
          {!reduceMotion && (
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.2)_50%)] bg-[length:100%_4px] z-20 pointer-events-none" />
          )}

          <div className="absolute top-1 left-2 text-[10px] font-bold uppercase text-accent tracking-[2px] z-10 bg-black/60 px-1 rounded shadow-[0_0_5px_currentColor]">
            FM [{currentStationIndex === -1 ? '0' : currentStationIndex + 1}]
          </div>

          <DotMatrixEQ active={isAudioActive} />

          <div className="flex items-center w-full h-full z-10 mt-[14px] [mask-image:linear-gradient(to_right,transparent,black_10%,black_80%,transparent)]">
            {currentStationIndex !== -1 ? (
              reduceMotion ? (
                <div className="w-full truncate text-center text-[22px] font-digital text-[#00f2ff] tracking-[2px]">
                  {stationName.toUpperCase()}{songText ? ` // ${songText.toUpperCase()}` : ''}
                </div>
              ) : (
                <motion.div
                  className="whitespace-nowrap text-[26px] font-digital text-[#00f2ff] tracking-[3px] drop-shadow-[0_0_5px_rgba(0,242,255,0.8)]"
                  animate={{ x: ['100%', '-100%'] }}
                  transition={{ repeat: Infinity, duration: 15, ease: 'linear' }}
                >
                  {stationName.toUpperCase()} {songText ? `// ${songText.toUpperCase()}` : ''}
                </motion.div>
              )
            ) : (
              <div className="text-[26px] font-digital text-red-500 tracking-[3px] w-full text-center drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]">
                SYSTEM OFFLINE
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 text-right flex justify-end items-center gap-6 pointer-events-auto">
          <div className="text-right">
            <div className="text-[12px] uppercase tracking-[1px] text-accent">Speed</div>
            <div className="text-[18px] text-[#00ff00]">
              {sweepSpeed <= 0.5 ? 'Slow' : sweepSpeed <= 0.75 ? 'Normal' : 'Fast'}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); useStore.getState().setPaused(true); }}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/30 rounded text-sm uppercase tracking-wider transition-colors pointer-events-auto"
          >
            Menu (Esc)
          </button>
        </div>
      </header>

      {currentPlayer && (
        <div className="absolute top-[100px] right-10 z-10 w-auto opacity-90 transition-opacity max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar pr-2">
          <Scorecard
            frames={currentFrames}
            playerName={currentPlayer.name}
            orientation="vertical"
            totalFrames={totalFrames}
            currentFrameIndex={currentFrame}
          />
        </div>
      )}

      <div className="flex-1 relative pointer-events-auto">
        {/* Spin UI */}
        {playState === 'spin' && (
          <div className="absolute left-1/2 bottom-[120px] -translate-x-1/2 w-[300px] h-[60px] bg-white/10 border-2 border-white/30 rounded-[30px] p-[5px] flex items-center">
            <div className="absolute -top-[30px] left-0 w-full text-center text-[14px] font-bold">SPIN</div>
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/50 -translate-x-1/2 z-10" />
            <div className="relative w-full h-full rounded-[20px] overflow-hidden">
              <div
                ref={spinKnobRef}
                className="absolute top-0 bottom-0 w-[40px] bg-accent rounded-full -translate-x-1/2"
                style={{ left: '50%' }}
              />
            </div>
          </div>
        )}

        {/* Power UI */}
        {playState === 'power' && (
          <div className="absolute left-10 bottom-[120px] w-[60px] h-[300px] bg-white/10 border-2 border-white/30 rounded-[30px] p-[5px] flex flex-col-reverse">
            <div className="absolute -top-[30px] left-0 w-full text-center text-[14px] font-bold">POWER</div>
            <div
              ref={powerFillRef}
              className="w-full bg-gradient-to-t from-[#00ff00] via-[#ffff00] to-[#ff0000] rounded-[20px]"
              style={{ height: '0%' }}
            />
          </div>
        )}

        {/* Celebration banner */}
        {celebration && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`text-[110px] font-black uppercase tracking-[6px] ${reduceMotion ? '' : 'animate-celebrate'}`}
              style={{
                color: CELEBRATIONS[celebration].color,
                textShadow: `0 0 40px ${CELEBRATIONS[celebration].glow}`,
              }}
            >
              {CELEBRATIONS[celebration].text}
            </div>
          </div>
        )}

        {/* End-of-turn panel.
            Anchored low and with no full-screen backdrop: it used to be a
            centred modal over a black overlay, which covered the celebration
            and the whole rack reset the class was watching. It also only
            appears once those have finished playing. */}
        {teacherAdvancePending && advanceReady && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-40 w-full max-w-3xl px-4">
            <div className="bg-panel/95 backdrop-blur-sm border-2 border-accent rounded-xl px-6 py-4 shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-tight">
                  {currentPlayer?.name}: {pinsDown} {pinsDown === 1 ? 'pin' : 'pins'}
                  <span className="text-[#aaa] font-normal text-xl"> &middot; total {currentScore}</span>
                </p>
                {!isLastTurnOfGame && upNext && (
                  <p className="text-lg text-[#00ffff] font-bold">Next up: {upNext.name}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {canUndo && (
                  <button
                    onClick={undoLastRoll}
                    className="px-5 py-3 bg-white/10 hover:bg-white/20 border border-white/30 rounded font-bold uppercase tracking-wider transition-colors pointer-events-auto"
                  >
                    Undo Roll
                  </button>
                )}
                <button
                  onClick={nextPlayer}
                  autoFocus
                  className="bg-warn text-black px-8 py-4 rounded font-black text-2xl uppercase tracking-wider hover:bg-white transition-colors shadow-[0_0_20px_rgba(255,255,0,0.4)] pointer-events-auto"
                >
                  {isLastTurnOfGame ? 'Finish Game' : 'Next Player'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Accessibility Tray */}
      <footer className="bg-black border-t-4 border-accent flex flex-col justify-center items-center z-20 py-4 min-h-[120px]">
        <div className="text-center px-6">
          <div className="text-[42px] leading-tight font-[800] text-warn uppercase tracking-[2px] drop-shadow-[0_0_20px_rgba(255,255,0,0.4)]">
            {prompt}
          </div>
          {!teacherAdvancePending && (
            <div className="text-[18px] text-[#aaa] mt-[5px]">
              {switchAcceptsAnyKey ? 'Any key, or click anywhere' : 'Spacebar, Enter, or click anywhere'}
              {switchHoldMs > 0 && ` — hold for ${(switchHoldMs / 1000).toFixed(1)}s`}
            </div>
          )}
        </div>

        {/* Hold-to-activate progress */}
        {switchActive && switchHoldMs > 0 && (
          <div className="mt-3 w-[320px] h-[8px] bg-white/15 rounded-full overflow-hidden" aria-hidden="true">
            <div ref={holdBarRef} className="h-full bg-accent rounded-full" style={{ width: '0%' }} />
          </div>
        )}

        {/* Auto-Assist countdown */}
        {switchActive && autoAssistMs > 0 && (
          <div className="mt-3 flex items-center gap-3" aria-hidden="true">
            <span className="text-[12px] uppercase tracking-[2px] text-[#00ff00]">Auto-Assist</span>
            <div className="w-[240px] h-[6px] bg-white/15 rounded-full overflow-hidden">
              <div ref={assistBarRef} className="h-full bg-[#00ff00] rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}

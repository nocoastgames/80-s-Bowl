import { useEffect, useRef, useState } from 'react';
import { useStore, calculateTotalScore } from '../../store';
import { useSingleSwitch } from '../../hooks/useSingleSwitch';
import { motion } from 'motion/react';
import { audioEngine } from '../../lib/audio';

export function GameplayOverlay() {
  const { playState, setPlayState, aimAngle, setAimAngle, powerLevel, setPowerLevel, sweepSpeed, gameMode, currentFrame, totalFrames, playerFrames, players, currentPlayerIndex, teacherAdvancePending, nextPlayer, isPaused } = useStore();
  
  const [localPos, setLocalPos] = useState(0);
  const [localAim, setLocalAim] = useState(0);
  const [localPower, setLocalPower] = useState(0);
  
  const localPosRef = useRef(0);
  const localAimRef = useRef(0);
  const localPowerRef = useRef(0);
  
  const posDir = useRef(1);
  const aimDir = useRef(1);
  const powerDir = useRef(1);

  useEffect(() => {
    if (playState === 'spin') {
      localPosRef.current = 0;
      localAimRef.current = 0;
      localPowerRef.current = 0;
      setLocalPos(0);
      setLocalAim(0);
      setLocalPower(0);
      posDir.current = 1;
      aimDir.current = 1;
      powerDir.current = 1;
    }
  }, [playState]);

  // Animation Loop
  useEffect(() => {
    let animationFrame: number;
    let lastTime = performance.now();
    
    const loop = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      
      if (useStore.getState().isPaused) {
        animationFrame = requestAnimationFrame(loop);
        return;
      }
      
      if (playState === 'spin') {
        let next = localPosRef.current + (delta * 2.0 * sweepSpeed * posDir.current);
        if (next > 1.0) {
          next = 1.0;
          posDir.current = -1;
        } else if (next < -1.0) {
          next = -1.0;
          posDir.current = 1;
        }
        localPosRef.current = next;
        setLocalPos(next);
        useStore.setState({ spinAmount: next });
      } else if (playState === 'aiming') {
        let next = localAimRef.current + (delta * 0.4 * sweepSpeed * aimDir.current);
        if (next > 0.2) {
          next = 0.2;
          aimDir.current = -1;
        } else if (next < -0.2) {
          next = -0.2;
          aimDir.current = 1;
        }
        localAimRef.current = next;
        setLocalAim(next);
        useStore.setState({ aimAngle: next });
      } else if (playState === 'power') {
        let next = localPowerRef.current + (delta * 100 * sweepSpeed * powerDir.current);
        if (next > 100) {
          next = 100;
          powerDir.current = -1;
        } else if (next < 0) {
          next = 0;
          powerDir.current = 1;
        }
        localPowerRef.current = next;
        setLocalPower(next);
      }
      animationFrame = requestAnimationFrame(loop);
    };
    
    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [playState, sweepSpeed]);

  const currentPlayer = players[currentPlayerIndex];
  const currentScore = currentPlayer ? calculateTotalScore(playerFrames[currentPlayer.id] || [], totalFrames) : 0;

  // Single Switch Handler
  useSingleSwitch(() => {
    const state = useStore.getState();
    if (state.isPaused) return;

    // Initialize audio on first interaction
    audioEngine.playBGM(state.currentStationIndex);

    if (teacherAdvancePending) return;

    if (playState === 'spin') {
      setPlayState('aiming');
    } else if (playState === 'aiming') {
      setAimAngle(localAim);
      setPlayState('power');
    } else if (playState === 'power') {
      setPowerLevel(localPower);
      setPlayState('rolling');
    }
  }, (playState === 'spin' || playState === 'aiming' || playState === 'power') && !teacherAdvancePending && !isPaused);

  if (playState === 'idle' && !teacherAdvancePending) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between" onClick={() => audioEngine.playBGM()}>
      {/* Top Bar */}
      <header className="h-[80px] bg-gradient-to-b from-header-bg to-transparent flex justify-between items-center px-10 z-10">
        <div className="flex gap-5">
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
            <div className="text-[24px] font-bold">{currentScore}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] uppercase tracking-[1px] text-accent">Current Speed</div>
          <div className="text-[18px] text-[#00ff00]">
            {sweepSpeed === 0.5 ? 'Slow (0.5x)' : sweepSpeed === 1.0 ? 'Normal (1.0x)' : 'Fast (2.0x)'}
          </div>
        </div>
      </header>

      <div className="flex-1 relative pointer-events-auto">
        {/* Spin UI */}
        {playState === 'spin' && (
          <div className="absolute left-1/2 bottom-[120px] -translate-x-1/2 w-[300px] h-[60px] bg-white/10 border-2 border-white/30 rounded-[30px] p-[5px] flex items-center">
            <div className="absolute -top-[30px] left-0 w-full text-center text-[14px] font-bold">SPIN</div>
            {/* Center marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/50 -translate-x-1/2 z-10" />
            
            <div className="relative w-full h-full rounded-[20px] overflow-hidden">
              <motion.div 
                className="absolute top-0 bottom-0 w-[40px] bg-accent rounded-full -translate-x-1/2"
                style={{ left: `${((localPos + 1) / 2) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Power UI */}
        {playState === 'power' && (
          <div className="absolute left-10 bottom-[120px] w-[60px] h-[300px] bg-white/10 border-2 border-white/30 rounded-[30px] p-[5px] flex flex-col-reverse">
            <div className="absolute -top-[30px] left-0 w-full text-center text-[14px] font-bold">POWER</div>
            <motion.div 
              className="w-full bg-gradient-to-t from-[#00ff00] via-[#ffff00] to-[#ff0000] rounded-[20px]"
              style={{ height: `${localPower}%` }}
            />
          </div>
        )}

        {/* Teacher Advance Modal */}
        {teacherAdvancePending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
            <div className="bg-panel p-8 rounded-xl border border-white/20 text-center max-w-md">
              <h2 className="text-3xl font-bold text-accent mb-4">Turn Complete</h2>
              <p className="text-xl mb-8">{currentPlayer?.name} scored {currentScore} points!</p>
              <button 
                onClick={nextPlayer}
                className="bg-warn text-black px-8 py-4 rounded font-black text-2xl uppercase tracking-wider hover:bg-white transition-colors shadow-[0_0_20px_rgba(255,255,0,0.4)] pointer-events-auto"
              >
                Next Player
              </button>
              <p className="text-[#aaa] mt-4 text-sm">(Teacher must click to advance)</p>
            </div>
          </div>
        )}
      </div>

      {/* Accessibility Tray */}
      <footer className="h-[120px] bg-black border-t-4 border-accent flex justify-center items-center z-20">
        <div className="text-center">
          <div className="text-[42px] font-[800] text-warn uppercase tracking-[2px] drop-shadow-[0_0_20px_rgba(255,255,0,0.4)]">
            {teacherAdvancePending && "Waiting for Teacher..."}
            {!teacherAdvancePending && playState === 'spin' && "Press Switch to Lock Spin"}
            {!teacherAdvancePending && playState === 'aiming' && "Press Switch to Lock Aim"}
            {!teacherAdvancePending && playState === 'power' && "Press Switch for Power"}
            {!teacherAdvancePending && playState === 'rolling' && "Rolling..."}
            {!teacherAdvancePending && playState === 'scoring' && "Scoring..."}
          </div>
          {!teacherAdvancePending && (
            <div className="text-[18px] text-[#aaa] mt-[5px]">
              Spacebar, Enter, or Click anywhere
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

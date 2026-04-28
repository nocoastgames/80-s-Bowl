import { useEffect, useRef, useState } from 'react';
import { useStore, calculateTotalScore } from '../../store';
import { useSingleSwitch } from '../../hooks/useSingleSwitch';
import { useCurrentSong } from '../../hooks/useCurrentSong';
import { motion, useAnimationFrame } from 'motion/react';
import { audioEngine, RADIO_STATIONS } from '../../lib/audio';

const BARS = 32;
const ROWS = 6;

const DotMatrixEQ = ({ active }: { active: boolean }) => {
  const [eqData, setEqData] = useState<number[]>(Array(BARS).fill(0));

  useAnimationFrame(() => {
    if (!active) {
      setEqData(Array(BARS).fill(0));
      return;
    }
    const data = audioEngine.getEQData();
    if (data && data.some((v: number) => v > 0)) {
      const numBins = data.length;
      const binsPerBar = Math.max(1, Math.floor(numBins / BARS));
      const newLevels = [];
      for (let i = 0; i < BARS; i++) {
        let sum = 0;
        let count = 0;
        for (let j = 0; j < binsPerBar; j++) {
           if (i * binsPerBar + j < numBins) {
              sum += data[i * binsPerBar + j];
              count++;
           }
        }
        let avg = count > 0 ? sum / count : 0;
        newLevels.push(Math.min(1.0, avg / 255) * 1.5);
      }
      setEqData(newLevels);
    } else {
      setEqData(prev => prev.map(() => Math.random() * 0.8));
    }
  });

  return (
    <div className="absolute bottom-1 left-2 right-2 flex items-end justify-between opacity-50 mix-blend-screen pointer-events-none z-0">
      {eqData.map((val, i) => {
         const activeDots = Math.round(val * ROWS);
         return (
            <div key={i} className="flex flex-col-reverse justify-start gap-[2px] h-[36px] w-[8px]">
               {Array.from({ length: ROWS }).map((_, r) => {
                 let color = 'bg-[#00f2ff]/10';
                 if (r < activeDots) {
                    if (r >= Math.floor(ROWS * 0.8)) color = 'bg-red-500 shadow-[0_0_5px_red]';
                    else if (r >= Math.floor(ROWS * 0.5)) color = 'bg-yellow-400 shadow-[0_0_5px_yellow]';
                    else color = 'bg-[#00ff00] shadow-[0_0_5px_lime]';
                 }
                 return <div key={r} className={`w-full h-[4px] rounded-[1px] ${color}`} />
               })}
            </div>
         );
      })}
    </div>
  );
};

import { Scorecard } from './Scorecard';

export function GameplayOverlay() {
  const { playState, setPlayState, aimAngle, setAimAngle, powerLevel, setPowerLevel, sweepSpeed, gameMode, currentFrame, totalFrames, playerFrames, players, currentPlayerIndex, teacherAdvancePending, nextPlayer, isPaused, currentStationIndex } = useStore();
  
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

  const stationName = currentStationIndex === -1 ? 'OFF' : RADIO_STATIONS[currentStationIndex]?.name || 'OFF';
  const isAudioActive = !isPaused && currentStationIndex !== -1 && audioEngine.isPlayingBgm;
  const songText = useCurrentSong(currentStationIndex);

  const [eqOpacity, setEqOpacity] = useState(1);
  const opacityTimeoutRef = useRef<number>();

  useEffect(() => {
    audioEngine.playBGM(currentStationIndex);
  }, []);

  useEffect(() => {
    setEqOpacity(1);
    if (opacityTimeoutRef.current) clearTimeout(opacityTimeoutRef.current);
    opacityTimeoutRef.current = window.setTimeout(() => {
       setEqOpacity(0.5);
    }, 4000);
  }, [currentStationIndex, songText]);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
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
            <div className="text-[24px] font-bold">{currentScore}</div>
          </div>
        </div>

        {/* Center Digital EQ */}
        <div 
          className="flex-none flex flex-col items-center justify-center bg-black/80 border-2 border-accent/40 rounded-lg px-2 py-1 w-[380px] h-[60px] overflow-hidden relative shadow-[inset_0_0_15px_rgba(0,242,255,0.2)] transition-opacity duration-1000"
          style={{ opacity: eqOpacity }}
        >
          {/* Scanline overlay for that retro feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.2)_50%)] bg-[length:100%_4px] z-20 pointer-events-none" />

          {/* Title */}
          <div className="absolute top-1 left-2 text-[10px] font-bold uppercase text-accent tracking-[2px] z-10 bg-black/60 px-1 rounded shadow-[0_0_5px_currentColor]">FM [{currentStationIndex === -1 ? '0' : currentStationIndex + 1}]</div>
          
          <DotMatrixEQ active={isAudioActive} />
          
          <div className="flex items-center w-full h-full z-10 mt-[14px] [mask-image:linear-gradient(to_right,transparent,black_10%,black_80%,transparent)]">
             {currentStationIndex !== -1 ? (
               <motion.div 
                 className="whitespace-nowrap text-[26px] font-digital text-[#00f2ff] tracking-[3px] drop-shadow-[0_0_5px_rgba(0,242,255,0.8)]"
                 animate={{ x: ['100%', '-100%'] }}
                 transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
               >
                 {stationName.toUpperCase()} {songText ? `// ${songText.toUpperCase()}` : ''}
               </motion.div>
             ) : (
               <div className="text-[26px] font-digital text-red-500 tracking-[3px] w-full text-center drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]">SYSTEM OFFLINE</div>
             )}
          </div>
        </div>

        <div className="flex-1 text-right flex justify-end items-center gap-6 pointer-events-auto">
          <div className="text-right">
            <div className="text-[12px] uppercase tracking-[1px] text-accent">Current Speed</div>
            <div className="text-[18px] text-[#00ff00]">
              {sweepSpeed === 0.5 ? 'Slow' : sweepSpeed === 0.75 ? 'Normal' : 'Fast'}
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
          <Scorecard frames={playerFrames[currentPlayer.id] || []} playerName={currentPlayer.name} orientation="vertical" />
        </div>
      )}

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
            {!teacherAdvancePending && playState === 'idle' && "Resetting..."}
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

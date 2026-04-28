import React from 'react';
import { useStore, Frame } from '../../store';

export function Scorecard({ frames, playerName }: { frames: Frame[], playerName: string }) {
  // Calculate running scores
  const runningScores: (number | null)[] = [];
  let currentTotal = 0;

  for (let i = 0; i < 10; i++) {
    const f = frames[i];
    if (!f || f.roll1 === null) {
      runningScores.push(null);
      continue;
    }

    let frameScore = 0;
    let isComplete = false;

    if (f.roll1 === 10) { // Strike
      frameScore = 10;
      if (i < 9) {
        const next = frames[i+1];
        if (next && next.roll1 !== null) {
          frameScore += next.roll1;
          if (next.roll1 === 10 && i < 8) {
            const nextNext = frames[i+2];
            if (nextNext && nextNext.roll1 !== null) {
              frameScore += nextNext.roll1;
              isComplete = true;
            }
          } else if (next.roll2 !== null) {
            frameScore += next.roll2;
            isComplete = true;
          }
        }
      } else {
        if (f.roll2 !== null && f.roll3 !== null) {
          frameScore += f.roll2 + f.roll3;
          isComplete = true;
        }
      }
    } else if (f.roll1 + (f.roll2 || 0) === 10 && f.roll2 !== null) { // Spare
      frameScore = 10;
      if (i < 9) {
        const next = frames[i+1];
        if (next && next.roll1 !== null) {
          frameScore += next.roll1;
          isComplete = true;
        }
      } else {
        if (f.roll3 !== null) {
          frameScore += f.roll3;
          isComplete = true;
        }
      }
    } else if (f.roll2 !== null) { // Open frame
      frameScore = f.roll1 + f.roll2;
      isComplete = true;
    }

    if (isComplete || (i === 9 && (f.roll1 !== null && f.roll2 !== null && f.roll1 + f.roll2 < 10))) {
      currentTotal += frameScore;
      runningScores.push(currentTotal);
    } else {
      runningScores.push(null);
    }
  }

  return (
    <div className="bg-black/80 border-2 border-accent/40 rounded-lg p-2 font-mono text-white shadow-[0_0_15px_rgba(0,242,255,0.2)]">
      <div className="text-accent text-sm mb-1 uppercase tracking-wider pl-1">{playerName}'s Scorecard</div>
      <div className="flex border border-white/20 rounded overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => {
          const f = frames[i] || { roll1: null, roll2: null, roll3: null };
          let r1 = f.roll1 !== null ? f.roll1.toString() : '';
          let r2 = f.roll2 !== null ? f.roll2.toString() : '';
          let r3 = f.roll3 !== null ? f.roll3.toString() : '';

          if (i < 9) {
            if (f.roll1 === 10) {
              r1 = '';
              r2 = 'X';
            } else if (f.roll1 !== null && f.roll2 !== null && f.roll1 + f.roll2 === 10) {
              r2 = '/';
            } else {
              if (r1 === '0') r1 = '-';
              if (r2 === '0') r2 = '-';
            }
          } else {
            // 10th frame
            if (f.roll1 === 10) r1 = 'X';
            else if (r1 === '0') r1 = '-';

            if (f.roll2 === 10) r2 = 'X';
            else if (f.roll1 !== null && f.roll1 !== 10 && f.roll1 + (f.roll2 || 0) === 10) r2 = '/';
            else if (r2 === '0') r2 = '-';

            if (f.roll3 === 10) r3 = 'X';
            else if (f.roll2 !== null && f.roll2 !== 10 && f.roll1 === 10 && f.roll2 + (f.roll3 || 0) === 10) r3 = '/';
            else if (r3 === '0') r3 = '-';
          }

          return (
            <div key={i} className="flex flex-col border-r border-white/20 last:border-r-0" style={{ width: i === 9 ? '75px' : '55px' }}>
              <div className="text-center text-[10px] bg-white/10 py-0.5 border-b border-white/20">{i + 1}</div>
              <div className="flex border-b border-white/20 h-6">
                <div className="flex-1 text-center border-r border-white/20 text-sm leading-6">{r1}</div>
                <div className="flex-1 text-center text-sm leading-6">{r2}</div>
                {i === 9 && (
                  <div className="flex-1 text-center border-l border-white/20 text-sm leading-6">{r3}</div>
                )}
              </div>
              <div className="text-center text-sm leading-7 h-7">
                {runningScores[i] !== null ? runningScores[i] : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

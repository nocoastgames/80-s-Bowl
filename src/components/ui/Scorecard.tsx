import React from 'react';
import type { Frame } from '../../store';

interface ScorecardProps {
  frames: Frame[];
  playerName: string;
  orientation?: 'horizontal' | 'vertical';
  /** How many frames this game is set to. The 1–10 setup slider makes this vary. */
  totalFrames?: number;
  /** Frame currently being bowled, highlighted so students can follow along. */
  currentFrameIndex?: number;
}

/**
 * Running totals per frame.
 *
 * `totalFrames` matters: the last frame is the one that gets bonus rolls, and
 * with the frame-count slider set to anything under 10 that is not frame 10.
 * This used to be hardcoded, so a 5-frame game drew ten boxes and looked for
 * its bonus rolls in a frame that was never bowled.
 */
function computeRunningScores(frames: Frame[], totalFrames: number): (number | null)[] {
  const runningScores: (number | null)[] = [];
  const lastIndex = totalFrames - 1;
  let currentTotal = 0;

  for (let i = 0; i < totalFrames; i++) {
    const f = frames[i];
    if (!f || f.roll1 === null) {
      runningScores.push(null);
      continue;
    }

    let frameScore = 0;
    let isComplete = false;

    if (f.roll1 === 10) { // Strike
      frameScore = 10;
      if (i < lastIndex) {
        const next = frames[i + 1];
        if (next && next.roll1 !== null) {
          frameScore += next.roll1;
          if (next.roll1 === 10 && i < lastIndex - 1) {
            const nextNext = frames[i + 2];
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
      if (i < lastIndex) {
        const next = frames[i + 1];
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

    if (isComplete) {
      currentTotal += frameScore;
      runningScores.push(currentTotal);
    } else {
      runningScores.push(null);
    }
  }

  return runningScores;
}

/** Turn raw pin counts into the X / ⁄ / – marks bowlers expect. */
function formatFrame(f: Frame, isLastFrame: boolean) {
  let r1 = f.roll1 !== null ? f.roll1.toString() : '';
  let r2 = f.roll2 !== null ? f.roll2.toString() : '';
  let r3 = f.roll3 !== null ? f.roll3.toString() : '';

  if (!isLastFrame) {
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
    if (f.roll1 === 10) r1 = 'X';
    else if (r1 === '0') r1 = '-';

    if (f.roll2 === 10) r2 = 'X';
    else if (f.roll1 !== null && f.roll1 !== 10 && f.roll1 + (f.roll2 || 0) === 10) r2 = '/';
    else if (r2 === '0') r2 = '-';

    if (f.roll3 === 10) r3 = 'X';
    else if (f.roll2 !== null && f.roll2 !== 10 && f.roll1 === 10 && f.roll2 + (f.roll3 || 0) === 10) r3 = '/';
    else if (r3 === '0') r3 = '-';
  }

  return { r1, r2, r3 };
}

const EMPTY_FRAME: Frame = { roll1: null, roll2: null, roll3: null };

function ScorecardImpl({
  frames,
  playerName,
  orientation = 'horizontal',
  totalFrames = 10,
  currentFrameIndex,
}: ScorecardProps) {
  const runningScores = computeRunningScores(frames, totalFrames);
  const lastIndex = totalFrames - 1;
  const finalScore = [...runningScores].reverse().find((s) => s !== null) ?? 0;

  return (
    <div className="bg-black/80 border-2 border-accent/40 rounded-lg p-2 font-mono text-white shadow-[0_0_15px_rgba(0,242,255,0.2)]">
      <div className="text-accent text-sm mb-1 uppercase tracking-wider pl-1 flex justify-between gap-3">
        <span>{playerName}</span>
        <span className="text-white/70">{finalScore}</span>
      </div>
      <div
        className={`flex ${orientation === 'vertical' ? 'flex-col' : ''} border border-white/20 rounded overflow-hidden`}
        role="table"
        aria-label={`Scorecard for ${playerName}, total ${finalScore}`}
      >
        {Array.from({ length: totalFrames }).map((_, i) => {
          const f = frames[i] || EMPTY_FRAME;
          const isLastFrame = i === lastIndex;
          const isCurrent = i === currentFrameIndex;
          const { r1, r2, r3 } = formatFrame(f, isLastFrame);
          const highlight = isCurrent ? 'bg-accent/15 ring-1 ring-inset ring-accent/60' : '';

          return orientation === 'horizontal' ? (
            <div
              key={i}
              className={`flex flex-col border-r border-white/20 last:border-r-0 ${highlight}`}
              style={{ width: isLastFrame ? '75px' : '55px' }}
            >
              <div className="text-center text-[10px] bg-white/10 py-0.5 border-b border-white/20">{i + 1}</div>
              <div className="flex border-b border-white/20 h-6">
                <div className="flex-1 text-center border-r border-white/20 text-sm leading-6">{r1}</div>
                <div className="flex-1 text-center text-sm leading-6">{r2}</div>
                {isLastFrame && (
                  <div className="flex-1 text-center border-l border-white/20 text-sm leading-6">{r3}</div>
                )}
              </div>
              <div className="text-center text-sm leading-7 h-7">
                {runningScores[i] !== null ? runningScores[i] : ''}
              </div>
            </div>
          ) : (
            <div key={i} className={`flex border-b border-white/20 last:border-b-0 w-32 ${highlight}`}>
              <div className="w-6 flex shrink-0 items-center justify-center text-[10px] bg-white/10 border-r border-white/20 py-1">
                {i + 1}
              </div>
              <div className="flex-1 flex flex-col">
                <div className="flex border-b border-white/20 h-6">
                  <div className="flex-1 text-center border-r border-white/20 text-sm leading-6">{r1}</div>
                  <div className={`flex-1 text-center text-sm leading-6 ${isLastFrame ? 'border-r border-white/20' : ''}`}>{r2}</div>
                  {isLastFrame && (
                    <div className="flex-1 text-center text-sm leading-6">{r3}</div>
                  )}
                </div>
                <div className="text-center text-sm leading-6 h-6 bg-black/20">
                  {runningScores[i] !== null ? runningScores[i] : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The overlay re-renders on every play-state change; the scorecard only needs
// to redraw when the frames themselves move.
export const Scorecard = React.memo(ScorecardImpl);

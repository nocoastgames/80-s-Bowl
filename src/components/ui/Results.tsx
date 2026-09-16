import { useStore, calculateTotalScore, type Frame } from '../../store';
import { audioEngine } from '../../lib/audio';
import { Scorecard } from './Scorecard';

/** Wrap a CSV cell so names with commas or quotes survive the round trip. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Frame summary in standard bowling notation. */
function frameNotation(f: Frame | undefined, isLastFrame: boolean): string {
  if (!f || f.roll1 === null) return '';
  const mark = (n: number | null) => (n === null ? '' : n === 10 ? 'X' : n === 0 ? '-' : String(n));

  if (!isLastFrame) {
    if (f.roll1 === 10) return 'X';
    if (f.roll2 !== null && f.roll1 + f.roll2 === 10) return `${mark(f.roll1)}/`;
    return `${mark(f.roll1)}${mark(f.roll2)}`;
  }
  return [f.roll1, f.roll2, f.roll3].map(mark).join('');
}

export function Results() {
  const players = useStore((s) => s.players);
  const playerFrames = useStore((s) => s.playerFrames);
  const resetGame = useStore((s) => s.resetGame);
  const startGame = useStore((s) => s.startGame);
  const gameMode = useStore((s) => s.gameMode);
  const totalFrames = useStore((s) => s.totalFrames);

  const playerScores = players.map(p => ({
    player: p,
    score: calculateTotalScore(playerFrames[p.id] || [], totalFrames)
  })).sort((a, b) => b.score - a.score);

  const winner = playerScores[0]?.player;
  const winnerScore = playerScores[0]?.score || 0;

  const totalScore = playerScores.reduce((sum, p) => sum + p.score, 0);
  const averageScore = players.length > 0 ? Math.round(totalScore / players.length) : 0;
  const bestScore = playerScores[0]?.score ?? 0;

  const exportCSV = () => {
    const dateLabel = new Date().toISOString().slice(0, 10);
    const headers = [
      'Rank',
      'Player',
      ...Array.from({ length: totalFrames }, (_, i) => `Frame ${i + 1}`),
      'Total Score',
    ];

    const rows = playerScores.map((ps, index) => {
      const frames = playerFrames[ps.player.id] || [];
      const frameCells = Array.from({ length: totalFrames }, (_, i) =>
        frameNotation(frames[i], i === totalFrames - 1)
      );
      return [index + 1, ps.player.name, ...frameCells, ps.score];
    });

    const csvContent = [
      headers.map(csvCell).join(','),
      ...rows.map(row => row.map(csvCell).join(',')),
    ].join('\r\n');

    // Byte order mark so Excel opens it as UTF-8 rather than mangling names.
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `bowling-${gameMode === 'single' ? 'single' : 'class'}-${dateLabel}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleReturnToMenu = () => {
    audioEngine.stopBGM();
    resetGame();
  };

  /** Keep the same players and settings, wipe the scores. */
  const handlePlayAgain = () => {
    startGame(gameMode === 'single' ? players[0]?.name : undefined);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center bg-bg-dark text-white p-8 overflow-y-auto custom-scrollbar">
      <h2 className="text-6xl font-black tracking-tight my-8 text-warn drop-shadow-[0_0_20px_rgba(255,255,0,0.4)]">
        {gameMode === 'single' ? 'Game Over!' : 'Class Complete!'}
      </h2>

      <div className="bg-panel p-12 rounded border-l-4 border-warn mb-12 text-center flex flex-col items-center gap-4">
        <h3 className="text-3xl font-bold text-[#aaa] uppercase tracking-[2px]">
          {gameMode === 'single' ? 'Final Score' : 'Class Winner'}
        </h3>
        <p className="text-7xl font-black text-white">
          {gameMode === 'single' ? winnerScore : (winner?.name || 'Unknown')}
        </p>
        {gameMode === 'class' && (
          <>
            <p className="text-3xl font-bold text-accent mt-4">Score: {winnerScore}</p>
            <div className="mt-8 pt-8 border-t border-white/20 w-full grid grid-cols-3 gap-6">
              <div>
                <h4 className="text-sm text-[#aaa] uppercase tracking-wider mb-1">Players</h4>
                <p className="text-4xl font-black text-white">{players.length}</p>
              </div>
              <div>
                <h4 className="text-sm text-[#aaa] uppercase tracking-wider mb-1">Average</h4>
                <p className="text-4xl font-black text-white">{averageScore}</p>
              </div>
              <div>
                <h4 className="text-sm text-[#aaa] uppercase tracking-wider mb-1">Best</h4>
                <p className="text-4xl font-black text-white">{bestScore}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="w-full max-w-5xl flex flex-col gap-4 mb-8 pr-2">
        {playerScores.map((ps, idx) => (
          <div key={ps.player.id} className="w-full flex items-center gap-4 bg-black/40 p-4 rounded-lg">
            <div className="text-2xl font-bold text-accent w-12 text-center">#{idx + 1}</div>
            <div className="flex-1 overflow-x-auto custom-scrollbar pb-2">
              <Scorecard
                frames={playerFrames[ps.player.id] || []}
                playerName={ps.player.name}
                totalFrames={totalFrames}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-6 flex-wrap justify-center pb-8">
        <button
          onClick={handlePlayAgain}
          className="px-8 py-4 bg-[#00ff00] text-black hover:bg-[#00cc00] rounded font-bold text-2xl transition-colors"
        >
          {gameMode === 'single' ? 'Bowl Again' : 'Bowl Again (same class)'}
        </button>
        <button
          onClick={exportCSV}
          className="px-8 py-4 bg-accent text-black hover:bg-accent/80 rounded font-bold text-2xl transition-colors"
        >
          Export CSV
        </button>
        <button
          onClick={handleReturnToMenu}
          className="px-8 py-4 bg-panel border border-white/10 hover:bg-white/10 rounded font-bold text-2xl transition-colors"
        >
          Main Menu
        </button>
      </div>
    </div>
  );
}

import { useStore, calculateTotalScore } from '../../store';
import { audioEngine } from '../../lib/audio';

export function Results() {
  const { players, playerFrames, resetGame, gameMode, totalFrames } = useStore();

  const playerScores = players.map(p => ({
    player: p,
    score: calculateTotalScore(playerFrames[p.id] || [], totalFrames)
  })).sort((a, b) => b.score - a.score);

  const winner = playerScores[0]?.player;
  const winnerScore = playerScores[0]?.score || 0;
  
  const totalScore = playerScores.reduce((sum, p) => sum + p.score, 0);
  const averageScore = players.length > 0 ? Math.round(totalScore / players.length) : 0;

  const exportCSV = () => {
    let csvContent = '';
    
    if (gameMode === 'single') {
      const headers = ['Player', ...Array.from({ length: totalFrames }, (_, i) => `Frame ${i + 1}`), 'Total Score'];
      const p = players[0];
      const frames = playerFrames[p?.id] || [];
      const frameScores = frames.map(f => {
        if (f.roll1 === 10) return 'X';
        if (f.roll1 !== null && f.roll2 !== null && f.roll1 + f.roll2 === 10) return `${f.roll1}/`;
        return `${f.roll1 || 0},${f.roll2 || 0}`;
      });
      
      const rows = [[p?.name || 'Player', ...frameScores, winnerScore]];
      csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    } else {
      const headers = ['Rank', 'Player', ...Array.from({ length: totalFrames }, (_, i) => `Frame ${i + 1}`), 'Total Score'];
      const rows = playerScores.map((ps, index) => {
        const frames = playerFrames[ps.player.id] || [];
        const frameScores = frames.map(f => {
          if (f.roll1 === 10) return 'X';
          if (f.roll1 !== null && f.roll2 !== null && f.roll1 + f.roll2 === 10) return `${f.roll1}/`;
          return `${f.roll1 || 0},${f.roll2 || 0}`;
        });
        return [index + 1, ps.player.name, ...frameScores, ps.score];
      });

      csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');
    }

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', gameMode === 'single' ? 'single_player_results.csv' : 'class_results.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReturnToMenu = () => {
    audioEngine.stopBGM();
    resetGame();
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-dark text-white p-8 overflow-y-auto">
      <h2 className="text-6xl font-black tracking-tight mb-8 text-warn drop-shadow-[0_0_20px_rgba(255,255,0,0.4)]">
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
            <div className="mt-8 pt-8 border-t border-white/20 w-full">
              <h4 className="text-xl text-[#aaa] uppercase tracking-wider mb-2">Class Average</h4>
              <p className="text-5xl font-black text-white">{averageScore}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-6">
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

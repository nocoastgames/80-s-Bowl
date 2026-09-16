import { useEffect, useState } from 'react';
import { useStore, type Player } from '../../store';
import { RADIO_STATIONS, audioEngine } from '../../lib/audio';
import { AccessibilityPanel } from './AccessibilityPanel';
import { loadRosters, saveRoster, deleteRoster, type SavedRoster } from '../../lib/persist';

const MAX_PLAYERS = 32;

/** `undefined` means "use the class default", which is the common case. */
type Override<T> = T | undefined;

function OverrideSelect<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Override<T>;
  options: { label: string; value: T }[];
  onChange: (value: Override<T>) => void;
}) {
  const selected = value === undefined ? '' : String(value);
  return (
    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[1px] text-accent">
      {label}
      <select
        value={selected}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          const match = options.find((o) => String(o.value) === raw);
          onChange(match ? match.value : undefined);
        }}
        className="bg-bg-dark border border-white/20 rounded px-2 py-1.5 text-sm text-white normal-case tracking-normal focus:border-accent focus:outline-none"
      >
        <option value="">Class default</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function PlayerRow({
  player,
  index,
  onRemove,
  onUpdate,
}: {
  player: Player;
  index: number;
  onRemove: () => void;
  onUpdate: (patch: Partial<Player>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOverrides =
    player.oneTouchMode !== undefined ||
    player.bumpersEnabled !== undefined ||
    player.sweepSpeed !== undefined ||
    player.autoAssistMs !== undefined;

  return (
    <li className="bg-white/5 rounded border border-white/10 overflow-hidden">
      <div className="flex justify-between items-center p-3 gap-2">
        <span className="text-xl font-medium flex-1 min-w-0 truncate">
          {index + 1}. {player.name}
          {hasOverrides && (
            <span className="ml-2 text-[11px] uppercase tracking-[1px] text-[#00ff00] align-middle">
              custom
            </span>
          )}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-sm px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded font-bold whitespace-nowrap"
        >
          {expanded ? 'Hide' : 'Settings'}
        </button>
        <button
          onClick={onRemove}
          className="text-[#ff3b3b] hover:text-[#ff0000] font-bold px-2"
          aria-label={`Remove ${player.name}`}
        >
          Remove
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/10 p-3 bg-black/30">
          <p className="text-[#9aa] text-sm mb-3">
            Anything left on &ldquo;Class default&rdquo; follows the class-wide setting.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <OverrideSelect
              label="Control"
              value={player.oneTouchMode}
              options={[
                { label: 'Standard', value: false },
                { label: '1-Touch', value: true },
              ]}
              onChange={(v) => onUpdate({ oneTouchMode: v })}
            />
            <OverrideSelect
              label="Speed"
              value={player.sweepSpeed}
              options={[
                { label: 'Slow', value: 0.35 },
                { label: 'Relaxed', value: 0.5 },
                { label: 'Normal', value: 0.75 },
                { label: 'Fast', value: 1.0 },
              ]}
              onChange={(v) => onUpdate({ sweepSpeed: v })}
            />
            <OverrideSelect
              label="Bumpers"
              value={player.bumpersEnabled}
              options={[
                { label: 'Off', value: false },
                { label: 'On', value: true },
              ]}
              onChange={(v) => onUpdate({ bumpersEnabled: v })}
            />
            <OverrideSelect
              label="Auto-Assist"
              value={player.autoAssistMs}
              options={[
                { label: 'Off', value: 0 },
                { label: '5s', value: 5000 },
                { label: '10s', value: 10000 },
                { label: '20s', value: 20000 },
              ]}
              onChange={(v) => onUpdate({ autoAssistMs: v })}
            />
          </div>
          {hasOverrides && (
            <button
              onClick={() =>
                onUpdate({
                  oneTouchMode: undefined,
                  bumpersEnabled: undefined,
                  sweepSpeed: undefined,
                  autoAssistMs: undefined,
                })
              }
              className="mt-3 text-sm px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded"
            >
              Reset to class defaults
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function TournamentSetup() {
  const gameMode = useStore((s) => s.gameMode);
  const players = useStore((s) => s.players);
  const addPlayer = useStore((s) => s.addPlayer);
  const removePlayer = useStore((s) => s.removePlayer);
  const updatePlayer = useStore((s) => s.updatePlayer);
  const setPlayers = useStore((s) => s.setPlayers);
  const startGame = useStore((s) => s.startGame);
  const setGameState = useStore((s) => s.setGameState);
  const totalFrames = useStore((s) => s.totalFrames);
  const setTotalFrames = useStore((s) => s.setTotalFrames);
  const currentStationIndex = useStore((s) => s.currentStationIndex);
  const setCurrentStationIndex = useStore((s) => s.setCurrentStationIndex);

  const [name, setName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [rosters, setRosters] = useState<SavedRoster[]>([]);
  const [rosterName, setRosterName] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    setRosters(loadRosters());
  }, []);

  const handleStartGame = (playerName?: string) => {
    startGame(playerName);
    audioEngine.playBGM(useStore.getState().currentStationIndex);
  };

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const playerName = name.trim() || `Player ${players.length + 1}`;

    if (gameMode === 'single') {
      handleStartGame(playerName);
    } else if (players.length < MAX_PLAYERS) {
      addPlayer(playerName);
      setName('');
    }
  };

  /** Paste a class list straight out of a roster or gradebook. */
  const handleBulkAdd = () => {
    const names = bulkText
      .split(/[\n,]/)
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, MAX_PLAYERS - players.length);

    if (!names.length) return;
    setPlayers([
      ...players,
      ...names.map((n) => ({ id: Math.random().toString(36).substring(2, 9), name: n })),
    ]);
    setBulkText('');
    setShowBulk(false);
  };

  const handleSaveRoster = () => {
    if (!players.length) return;
    const next = saveRoster(rosterName || `Class ${rosters.length + 1}`, players);
    setRosters(next);
    setRosterName('');
    setSaveNotice('Class list saved to this device.');
    window.setTimeout(() => setSaveNotice(''), 3000);
  };

  const handleLoadRoster = (roster: SavedRoster) => {
    // Fresh ids, so loading the same class twice can't collide on score keys.
    setPlayers(roster.players.map((p) => ({ ...p, id: Math.random().toString(36).substring(2, 9) })));
    setRosterName(roster.name);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center bg-bg-dark text-white p-8 overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-5xl">
        <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
          <h2 className="text-4xl font-black tracking-tight text-accent drop-shadow-[0_0_10px_rgba(0,242,255,0.4)]">
            {gameMode === 'single' ? 'Single Player Setup' : 'Class Mode Setup'}
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="px-6 py-3 bg-panel border-2 border-accent hover:bg-accent hover:text-black rounded font-bold text-lg transition-colors"
            >
              Accessibility
            </button>
            <button
              onClick={() => setGameState('menu')}
              className="px-6 py-3 bg-panel border border-white/10 hover:bg-white/10 rounded font-bold text-xl transition-colors"
            >
              Back
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${gameMode === 'class' ? 'md:grid-cols-2' : ''} gap-8`}>
          <div className="bg-panel p-6 rounded border-l-4 border-accent">
            <h3 className="text-2xl font-bold mb-4">
              {gameMode === 'single' ? 'Enter Player Name' : `Add Player (${players.length}/${MAX_PLAYERS})`}
            </h3>
            <form onSubmit={handleAdd} className="flex gap-4">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Player ${players.length + 1}`}
                className="flex-1 min-w-0 bg-bg-dark border border-white/20 rounded px-4 py-3 text-xl focus:border-accent focus:outline-none"
                maxLength={20}
              />
              <button
                type="submit"
                disabled={gameMode === 'class' && players.length >= MAX_PLAYERS}
                className="px-6 py-3 bg-accent text-black hover:bg-accent/80 disabled:opacity-50 rounded font-bold text-xl transition-colors whitespace-nowrap"
              >
                {gameMode === 'single' ? 'Start Game' : 'Add'}
              </button>
            </form>

            {gameMode === 'class' && (
              <div className="mt-4">
                <button
                  onClick={() => setShowBulk((v) => !v)}
                  className="text-sm px-3 py-2 bg-white/10 hover:bg-white/20 rounded font-bold"
                >
                  {showBulk ? 'Cancel' : 'Paste a class list'}
                </button>
                {showBulk && (
                  <div className="mt-3">
                    <textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      rows={5}
                      placeholder={'One name per line, or comma separated'}
                      className="w-full bg-bg-dark border border-white/20 rounded px-3 py-2 focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={handleBulkAdd}
                      className="mt-2 px-5 py-2 bg-accent text-black hover:bg-accent/80 rounded font-bold"
                    >
                      Add these names
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-2">
              <label htmlFor="station" className="text-xl font-medium">Radio Station (keys 0&ndash;9):</label>
              <select
                id="station"
                value={currentStationIndex}
                onChange={(e) => setCurrentStationIndex(parseInt(e.target.value))}
                className="bg-bg-dark border border-white/20 rounded px-4 py-2 text-lg focus:border-accent focus:outline-none"
              >
                <option value={-1}>0. OFF</option>
                {RADIO_STATIONS.map((station, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {station.name}
                  </option>
                ))}
              </select>
              <p className="text-[#888] text-sm">
                Streams come from somafm.com. If your network blocks them the game still
                works &mdash; the sound effects are generated locally.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <label htmlFor="frames" className="text-xl font-medium">Number of Frames: {totalFrames}</label>
              <input
                id="frames"
                type="range"
                min="1"
                max="10"
                value={totalFrames}
                onChange={(e) => setTotalFrames(parseInt(e.target.value))}
                className="w-full accent-accent"
              />
              <p className="text-[#888] text-sm">
                Shorter games fit a class period. A full game is 10.
              </p>
            </div>

            {gameMode === 'class' && (
              <button
                onClick={() => handleStartGame()}
                disabled={players.length < 1}
                className="w-full mt-8 px-6 py-4 bg-[#00ff00] text-black hover:bg-[#00cc00] disabled:opacity-50 rounded font-black text-2xl transition-colors"
              >
                Start Class Game
              </button>
            )}
          </div>

          {gameMode === 'class' && (
            <div className="flex flex-col gap-6">
              <div className="bg-panel p-6 rounded border border-white/10">
                <h3 className="text-2xl font-bold mb-4">Players</h3>
                {players.length === 0 ? (
                  <p className="text-[#888] text-lg">No players added yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar pr-1">
                    {players.map((p, i) => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        index={i}
                        onRemove={() => removePlayer(p.id)}
                        onUpdate={(patch) => updatePlayer(p.id, patch)}
                      />
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-panel p-6 rounded border border-white/10">
                <h3 className="text-2xl font-bold mb-1">Saved Class Lists</h3>
                <p className="text-[#888] text-sm mb-4">
                  Saved in this browser on this computer, so you don&rsquo;t retype names each period.
                </p>

                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={rosterName}
                    onChange={(e) => setRosterName(e.target.value)}
                    placeholder="e.g. Period 3"
                    className="flex-1 min-w-0 bg-bg-dark border border-white/20 rounded px-3 py-2 focus:border-accent focus:outline-none"
                    maxLength={30}
                  />
                  <button
                    onClick={handleSaveRoster}
                    disabled={players.length === 0}
                    className="px-4 py-2 bg-accent text-black hover:bg-accent/80 disabled:opacity-50 rounded font-bold whitespace-nowrap"
                  >
                    Save list
                  </button>
                </div>
                {saveNotice && <p className="text-[#00ff00] text-sm mb-3">{saveNotice}</p>}

                {rosters.length === 0 ? (
                  <p className="text-[#888]">Nothing saved yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
                    {rosters.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded p-3"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="font-bold block truncate">{r.name}</span>
                          <span className="text-[#888] text-sm">
                            {r.players.length} {r.players.length === 1 ? 'player' : 'players'}
                          </span>
                        </span>
                        <button
                          onClick={() => handleLoadRoster(r)}
                          className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded font-bold text-sm whitespace-nowrap"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => setRosters(deleteRoster(r.id))}
                          className="text-[#ff3b3b] hover:text-[#ff0000] font-bold text-sm px-2"
                          aria-label={`Delete saved list ${r.name}`}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
          </div>
        </div>
      )}
    </div>
  );
}

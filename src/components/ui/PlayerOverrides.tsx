import { useStore, type Player } from '../../store';

/** `undefined` means "use the class default", which is the common case. */
type Override<T> = T | undefined;

function OverrideSelect<T extends string | number | boolean>({
  label,
  value,
  options,
  defaultLabel,
  onChange,
}: {
  label: string;
  value: Override<T>;
  options: { label: string; value: T }[];
  /** What "Class default" currently resolves to, spelled out. */
  defaultLabel: string;
  onChange: (value: Override<T>) => void;
}) {
  const selected = value === undefined ? '' : String(value);
  const isCustom = value !== undefined;
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
        className={`bg-bg-dark border rounded px-2 py-1.5 text-sm text-white normal-case tracking-normal focus:border-accent focus:outline-none ${
          isCustom ? 'border-[#00ff00]/70' : 'border-white/20'
        }`}
      >
        {/* Spelling out what the default resolves to matters: a student left on
            "Class default" still gets whatever the class-wide setting is, which
            reads as the setting being ignored if you can't see its value. */}
        <option value="">Class default ({defaultLabel})</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function playerHasOverrides(player: Player): boolean {
  return (
    player.oneTouchMode !== undefined ||
    player.bumpersEnabled !== undefined ||
    player.sweepSpeed !== undefined ||
    player.autoAssistMs !== undefined
  );
}

const speedLabel = (v: number) =>
  v <= 0.35 ? 'Slow' : v <= 0.5 ? 'Relaxed' : v <= 0.75 ? 'Normal' : 'Fast';

/**
 * Per-student settings, shared by the setup screen and the pause menu.
 *
 * Anything left on "Class default" follows the class-wide setting, so a teacher
 * only has to touch the students who need something different. Kept in one
 * place so the mid-game controls can't drift from the setup ones.
 */
export function PlayerOverrides({
  player,
  onUpdate,
  columns = 2,
}: {
  player: Player;
  onUpdate: (patch: Partial<Player>) => void;
  columns?: 2 | 4;
}) {
  const bumpersEnabled = useStore((s) => s.bumpersEnabled);
  const oneTouchMode = useStore((s) => s.oneTouchMode);
  const sweepSpeed = useStore((s) => s.sweepSpeed);
  const autoAssistMs = useStore((s) => s.autoAssistMs);

  const hasOverrides = playerHasOverrides(player);

  return (
    <div>
      <div className={`grid gap-3 ${columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
        <OverrideSelect
          label="Bumpers"
          value={player.bumpersEnabled}
          defaultLabel={bumpersEnabled ? 'On' : 'Off'}
          options={[
            { label: 'Off', value: false },
            { label: 'On', value: true },
          ]}
          onChange={(v) => onUpdate({ bumpersEnabled: v })}
        />
        <OverrideSelect
          label="Control"
          value={player.oneTouchMode}
          defaultLabel={oneTouchMode ? '1-Touch' : 'Standard'}
          options={[
            { label: 'Standard', value: false },
            { label: '1-Touch', value: true },
          ]}
          onChange={(v) => onUpdate({ oneTouchMode: v })}
        />
        <OverrideSelect
          label="Speed"
          value={player.sweepSpeed}
          defaultLabel={speedLabel(sweepSpeed)}
          options={[
            { label: 'Slow', value: 0.35 },
            { label: 'Relaxed', value: 0.5 },
            { label: 'Normal', value: 0.75 },
            { label: 'Fast', value: 1.0 },
          ]}
          onChange={(v) => onUpdate({ sweepSpeed: v })}
        />
        <OverrideSelect
          label="Auto-Assist"
          value={player.autoAssistMs}
          defaultLabel={autoAssistMs > 0 ? `${autoAssistMs / 1000}s` : 'Off'}
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
  );
}

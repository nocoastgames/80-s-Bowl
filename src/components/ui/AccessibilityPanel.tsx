import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useSingleSwitch } from '../../hooks/useSingleSwitch';

interface OptionGroupProps<T> {
  label: string;
  hint?: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}

function OptionGroup<T extends string | number | boolean>({
  label,
  hint,
  value,
  options,
  onChange,
}: OptionGroupProps<T>) {
  return (
    <fieldset className="bg-white/5 border border-white/10 rounded-lg p-4">
      <legend className="px-2 text-accent uppercase tracking-[1px] text-[12px] font-bold">{label}</legend>
      {hint && <p className="text-[#9aa] text-sm mb-3 mt-1">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className={`px-4 py-2 rounded font-bold transition-colors ${
                selected ? 'bg-accent text-black' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Lets a teacher confirm a student's switch is wired up and behaving before
 * the game starts — including that one physical press registers exactly once,
 * which is the single most common setup problem with switch interfaces.
 */
function SwitchTester() {
  const switchHoldMs = useStore((s) => s.switchHoldMs);
  const switchCooldownMs = useStore((s) => s.switchCooldownMs);
  const switchAcceptsAnyKey = useStore((s) => s.switchAcceptsAnyKey);

  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const holdBarRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useSingleSwitch(
    () => {
      setCount((c) => c + 1);
      setFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(false), 250);
    },
    {
      enabled: true,
      cooldownMs: switchCooldownMs,
      holdMs: switchHoldMs,
      acceptAnyKey: switchAcceptsAnyKey,
      onHoldProgress: (p) => {
        if (holdBarRef.current) holdBarRef.current.style.width = `${p * 100}%`;
      },
    }
  );

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  return (
    <div className="bg-black/40 border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-accent uppercase tracking-[1px] text-[12px] font-bold">Switch Test</span>
        <button
          type="button"
          onClick={() => setCount(0)}
          className="text-sm px-3 py-1 bg-white/10 hover:bg-white/20 rounded"
        >
          Reset
        </button>
      </div>
      <p className="text-[#9aa] text-sm mb-3">
        Press the switch. Each physical press should add exactly one.
      </p>
      <div
        className={`h-[72px] rounded-lg flex items-center justify-center text-4xl font-black transition-colors ${
          flash ? 'bg-accent text-black' : 'bg-white/5 text-white'
        }`}
      >
        {count}
      </div>
      {switchHoldMs > 0 && (
        <div className="mt-3 h-[8px] bg-white/15 rounded-full overflow-hidden">
          <div ref={holdBarRef} className="h-full bg-accent rounded-full" style={{ width: '0%' }} />
        </div>
      )}
    </div>
  );
}

export function AccessibilityPanel({ showTester = true }: { showTester?: boolean }) {
  const sweepSpeed = useStore((s) => s.sweepSpeed);
  const setSweepSpeed = useStore((s) => s.setSweepSpeed);
  const oneTouchMode = useStore((s) => s.oneTouchMode);
  const setOneTouchMode = useStore((s) => s.setOneTouchMode);
  const bumpersEnabled = useStore((s) => s.bumpersEnabled);
  const setBumpersEnabled = useStore((s) => s.setBumpersEnabled);
  const autoAssistMs = useStore((s) => s.autoAssistMs);
  const setAutoAssistMs = useStore((s) => s.setAutoAssistMs);
  const switchHoldMs = useStore((s) => s.switchHoldMs);
  const setSwitchHoldMs = useStore((s) => s.setSwitchHoldMs);
  const switchCooldownMs = useStore((s) => s.switchCooldownMs);
  const setSwitchCooldownMs = useStore((s) => s.setSwitchCooldownMs);
  const switchAcceptsAnyKey = useStore((s) => s.switchAcceptsAnyKey);
  const setSwitchAcceptsAnyKey = useStore((s) => s.setSwitchAcceptsAnyKey);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const setReduceMotion = useStore((s) => s.setReduceMotion);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <OptionGroup
        label="Control Mode"
        hint="1-Touch bowls with a single press: aim only, power is set for you."
        value={oneTouchMode}
        options={[
          { label: 'Standard (spin, aim, power)', value: false },
          { label: '1-Touch', value: true },
        ]}
        onChange={setOneTouchMode}
      />

      <OptionGroup
        label="Sweep Speed"
        hint="How fast the spin, aim and power meters move."
        value={sweepSpeed}
        options={[
          { label: 'Slow', value: 0.35 },
          { label: 'Relaxed', value: 0.5 },
          { label: 'Normal', value: 0.75 },
          { label: 'Fast', value: 1.0 },
        ]}
        onChange={setSweepSpeed}
      />

      <OptionGroup
        label="Hold To Activate"
        hint="Ignores brief accidental contact. The switch must be held this long to count."
        value={switchHoldMs}
        options={[
          { label: 'Off', value: 0 },
          { label: '0.3s', value: 300 },
          { label: '0.6s', value: 600 },
          { label: '1.0s', value: 1000 },
        ]}
        onChange={setSwitchHoldMs}
      />

      <OptionGroup
        label="Ignore Repeats"
        hint="Blocks a second activation right after the first. Raise this if one press registers twice."
        value={switchCooldownMs}
        options={[
          { label: '0.2s', value: 200 },
          { label: '0.4s', value: 400 },
          { label: '0.8s', value: 800 },
          { label: '1.5s', value: 1500 },
        ]}
        onChange={setSwitchCooldownMs}
      />

      <OptionGroup
        label="Auto-Assist"
        hint="Takes the shot automatically if no press arrives in time, so a turn never stalls."
        value={autoAssistMs}
        options={[
          { label: 'Off', value: 0 },
          { label: '5s', value: 5000 },
          { label: '10s', value: 10000 },
          { label: '20s', value: 20000 },
        ]}
        onChange={setAutoAssistMs}
      />

      <OptionGroup
        label="Accepted Keys"
        hint="Use Any Key for switch boxes that send something other than Space or Enter."
        value={switchAcceptsAnyKey}
        options={[
          { label: 'Space / Enter', value: false },
          { label: 'Any key', value: true },
        ]}
        onChange={setSwitchAcceptsAnyKey}
      />

      <OptionGroup
        label="Bumpers"
        hint="Blocks the gutters so every ball reaches the pins."
        value={bumpersEnabled}
        options={[
          { label: 'Off', value: false },
          { label: 'On', value: true },
        ]}
        onChange={setBumpersEnabled}
      />

      <OptionGroup
        label="Reduce Motion"
        hint="Stops the scrolling background, floating shapes, pulsing glows and scrolling text."
        value={reduceMotion}
        options={[
          { label: 'Off', value: false },
          { label: 'On', value: true },
        ]}
        onChange={setReduceMotion}
      />

      {showTester && (
        <div className="lg:col-span-2">
          <SwitchTester />
        </div>
      )}
    </div>
  );
}

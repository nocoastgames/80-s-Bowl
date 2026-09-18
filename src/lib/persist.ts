/**
 * localStorage persistence for teacher settings and class rosters.
 *
 * Everything here is best-effort: a locked-down school profile may have
 * storage disabled, so every read and write is wrapped and failures are
 * silent. The game must work fine with no storage at all.
 */
import type { Player } from '../store';

const SETTINGS_KEY = 'switch-strike-bowling/settings/v1';
const ROSTERS_KEY = 'switch-strike-bowling/rosters/v1';

export interface PersistedSettings {
  sweepSpeed: number;
  oneTouchMode: boolean;
  bumpersEnabled: boolean;
  totalFrames: number;
  autoAssistMs: number;
  switchHoldMs: number;
  switchCooldownMs: number;
  switchAcceptsAnyKey: boolean;
  teacherAdvanceRequired: boolean;
  reduceMotion: boolean;
  bgmVolume: number;
  sfxVolume: number;
  currentStationIndex: number;
}

export interface SavedRoster {
  id: string;
  name: string;
  players: Player[];
  savedAt: number;
}

export function loadSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSettings(settings: PersistedSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — settings just won't survive a reload */
  }
}

export function loadRosters(): SavedRoster[] {
  try {
    const raw = localStorage.getItem(ROSTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoster(name: string, players: Player[]): SavedRoster[] {
  const rosters = loadRosters();
  const trimmed = name.trim() || `Class ${rosters.length + 1}`;
  // Saving under an existing name overwrites it, so a teacher can keep one
  // entry per period rather than accumulating near-duplicates.
  const existing = rosters.find((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  const entry: SavedRoster = {
    id: existing?.id ?? Math.random().toString(36).slice(2, 10),
    name: trimmed,
    players: players.map((p) => ({ ...p })),
    savedAt: Date.now(),
  };
  const next = existing
    ? rosters.map((r) => (r.id === existing.id ? entry : r))
    : [...rosters, entry];
  try {
    localStorage.setItem(ROSTERS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function deleteRoster(id: string): SavedRoster[] {
  const next = loadRosters().filter((r) => r.id !== id);
  try {
    localStorage.setItem(ROSTERS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Respect the OS-level reduced-motion preference as the initial default. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

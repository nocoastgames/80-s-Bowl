/**
 * Bundled music.
 *
 * Tracks ship with the game under public/music rather than streaming from
 * anywhere. The previous SomaFM integration was blocked outright — their terms
 * say the streams are "not for use in video games", and they enforce it with a
 * 403 — and any other stream would carry both the same licensing problem and
 * the school network's filtering on top. Local files have neither, work
 * offline, and let the EQ analyser work again since same-origin audio isn't
 * CORS-restricted.
 */
export interface MusicTrack {
  file: string;
  artist: string;
  title: string;
  /** e.g. "CC BY 4.0". Shown on the credits screen. */
  license?: string;
  /** Where the track came from, for attribution. */
  url?: string;
}

export interface MusicStation {
  name: string;
  tracks: MusicTrack[];
}

export interface MusicManifest {
  stations: MusicStation[];
  /** Set when tracks.json exists but couldn't be parsed, so the UI can say so. */
  error?: string;
}

/** Absolute URL of a file in public/music, honouring the deploy's base path. */
export function musicUrl(file: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}music/${encodeURIComponent(file)}`;
}

const EMPTY: MusicManifest = { stations: [] };

export async function loadMusicManifest(): Promise<MusicManifest> {
  const base = import.meta.env.BASE_URL || '/';
  try {
    const res = await fetch(`${base}music/tracks.json`, { cache: 'no-cache' });
    if (!res.ok) return EMPTY;

    const data = await res.json();
    if (!data || !Array.isArray(data.stations)) return EMPTY;

    // Be forgiving about a hand-edited file: drop anything malformed rather
    // than failing the whole list, and keep only stations that have tracks.
    const stations: MusicStation[] = data.stations
      .filter((s: any) => s && typeof s.name === 'string' && Array.isArray(s.tracks))
      .map((s: any) => ({
        name: s.name,
        tracks: s.tracks
          .filter((t: any) => t && typeof t.file === 'string')
          .map((t: any) => ({
            file: t.file,
            artist: typeof t.artist === 'string' ? t.artist : 'Unknown artist',
            title: typeof t.title === 'string' ? t.title : t.file,
            license: typeof t.license === 'string' ? t.license : undefined,
            url: typeof t.url === 'string' ? t.url : undefined,
          })),
      }))
      .filter((s: MusicStation) => s.tracks.length > 0);

    return { stations };
  } catch (e) {
    // Almost always a stray comma in a hand-edited tracks.json.
    return { stations: [], error: (e as Error)?.message ?? 'could not read tracks.json' };
  }
}

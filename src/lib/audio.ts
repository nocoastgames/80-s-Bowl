/**
 * SomaFM stations.
 *
 * `playlist` is the authority. SomaFM retired its MP3 mounts in favour of AAC,
 * which silently killed every station here: the hardcoded `<id>-128-mp3` URLs
 * 404, while the song-title endpoint kept working, so the display showed a
 * track that was never playing. Reading the .pls at play time means a future
 * mount rename fixes itself. `fallbacks` cover the playlist fetch failing.
 */
export interface RadioStation {
  id: string;
  name: string;
  playlist: string;
  fallbacks: string[];
}

const somaStation = (id: string, name: string, playlistId = id): RadioStation => ({
  id,
  name,
  playlist: `https://api.somafm.com/${playlistId}130.pls`,
  fallbacks: [
    `https://ice6.somafm.com/${id}-128-aac`,
    `https://ice2.somafm.com/${id}-128-aac`,
    `https://ice1.somafm.com/${id}-128-aac`,
  ],
});

export const RADIO_STATIONS: RadioStation[] = [
  somaStation('u80s', 'Underground 80s'),
  somaStation('poptron', 'PopTron'),
  somaStation('groovesalad', 'Groove Salad'),
  somaStation('secretagent', 'Secret Agent'),
  somaStation('defcon', 'DEF CON Radio'),
  somaStation('spacestation', 'Space Station'),
  somaStation('fluid', 'Fluid'),
  somaStation('dronezone', 'Drone Zone'),
  somaStation('lush', 'Lush'),
];

/** Parse the File1=, File2= ... lines out of a PLS playlist, in order. */
function parsePls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^File\d+\s*=\s*(\S+)/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => m[1]);
}

class RetroAudioEngine {
  ctx: AudioContext | null = null;
  isPlayingBgm = false;
  rollSource: AudioBufferSourceNode | null = null;
  rollGain: GainNode | null = null;
  
  bgmAudio: HTMLAudioElement | null = null;
  sfxVolume = 0.8;
  bgmVolume = 0.5;
  masterVolume = 1;
  currentStationId: string | null = null;
  bgmFallbackAudio: HTMLAudioElement | null = null;
  usingFallbackAudio = false;
  resolvedUrls = new Map<string, string[]>();
  lastStationErrors: string[] = [];

  analyser: AnalyserNode | null = null;
  bgmSource: MediaElementAudioSourceNode | null = null;
  bgmGain: GainNode | null = null;
  freqData: Uint8Array | null = null;

  /** Everything goes through here, so the whole mix can be lifted at once. */
  master: GainNode | null = null;
  limiter: DynamicsCompressorNode | null = null;

  /** Which station we're loading, so a slow stream can't override a newer pick. */
  private loadToken = 0;
  /** Last station that failed every URL, for the UI to report. */
  stationFailed = false;

  stations = RADIO_STATIONS;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.ensureMaster();
  }

  /**
   * Master bus: everything into a gain stage, then a limiter, then out.
   *
   * Classroom smart boards and projectors are often far quieter than a laptop,
   * and every sound here was written conservatively straight to the
   * destination, so with the board at full volume there was nowhere left to go.
   * The limiter means the gain can be pushed past 1 for those rooms without the
   * loud moments — a strike, the roll rumble — turning to distortion.
   */
  private ensureMaster() {
    if (!this.ctx || this.master) return;
    const ctx = this.ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 1;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  /** Where every sound should connect instead of ctx.destination. */
  private out(): AudioNode {
    this.ensureMaster();
    return this.master ?? this.ctx!.destination;
  }

  getEQData() {
    if (this.analyser && this.freqData && this.isPlayingBgm) {
      this.analyser.getByteFrequencyData(this.freqData);
      return Array.from(this.freqData);
    }
    return null;
  }

  /**
   * Music level. Applied on a gain node rather than the element's own volume,
   * which is capped at 1 — the gain node can go past that for a quiet room.
   */
  setBgmVolume(vol: number) {
    this.bgmVolume = vol;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
    }
    if (this.bgmAudio) this.bgmAudio.volume = 1;
    // The no-CORS fallback bypasses the gain nodes, so it carries the level itself.
    if (this.bgmFallbackAudio) {
      this.bgmFallbackAudio.volume = Math.min(1, this.bgmVolume * this.masterVolume);
    }
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = vol;
  }

  /** Overall output level, applied after everything else. */
  setMasterVolume(vol: number) {
    this.masterVolume = vol;
    this.ensureMaster();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
    }
  }

  private ensureBgmElement() {
    if (this.bgmAudio) return;

    this.bgmAudio = new Audio();
    this.bgmAudio.crossOrigin = 'anonymous';
    this.bgmAudio.loop = true;
    this.bgmAudio.volume = 1;
    // Not preload="none": the stream has to actually start fetching for
    // playback to begin. Setting it to none meant load() did nothing, so every
    // candidate URL sat there until it timed out.
    this.bgmAudio.preload = 'auto';

    this.init();
    if (!this.ctx) return;

    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64; // 32 bins
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmVolume;
    }
    if (!this.bgmSource) {
      try {
        this.bgmSource = this.ctx.createMediaElementSource(this.bgmAudio);
        this.bgmSource.connect(this.bgmGain);
        this.bgmGain.connect(this.analyser);
        this.analyser.connect(this.out());
      } catch (e) {
        console.warn('Could not create audio node:', e);
      }
    }
  }

  /**
   * Resolve a station to a stream URL that actually loads.
   *
   * Reads the station's .pls for the current mounts and falls back to the
   * known AAC hosts if that fetch fails. Each candidate is tried in turn, so a
   * single dead edge node doesn't take the station down.
   */
  private async resolveStreamUrls(station: RadioStation): Promise<string[]> {
    try {
      const res = await fetch(station.playlist, { cache: 'no-store' });
      if (res.ok) {
        const urls = parsePls(await res.text());
        if (urls.length) return [...urls, ...station.fallbacks];
      }
    } catch {
      /* offline, blocked, or CORS — fall through to the known hosts */
    }
    return station.fallbacks;
  }

  /**
   * Point an element at a URL and actually start it.
   *
   * Driven by play() rather than by waiting for a `canplay` event: play()
   * reports its own failure, and calling it directly keeps the browser's
   * user-activation window intact, which waiting on an event does not.
   */
  private tryStream(audio: HTMLAudioElement, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        settled = true;
        audio.removeEventListener('error', onErr);
        clearTimeout(timer);
      };
      const onErr = () => { if (!settled) { cleanup(); reject(new Error(`cannot play ${url}`)); } };
      const timer = setTimeout(() => { if (!settled) { cleanup(); reject(new Error(`timeout ${url}`)); } }, 6000);

      audio.addEventListener('error', onErr);
      audio.src = url;
      audio.play().then(
        () => { if (!settled) { cleanup(); resolve(); } },
        (e) => { if (!settled) { cleanup(); reject(e); } }
      );
    });
  }

  /**
   * Element used when the CORS-enabled one can't play a stream.
   *
   * crossOrigin="anonymous" is required to feed the EQ analyser, but if a
   * stream host doesn't return CORS headers the load fails outright. Music
   * matters more than the visualiser, so this plays straight to the output
   * with no analyser and no master bus — a fallback, not the normal path.
   */
  private ensureFallbackElement(): HTMLAudioElement {
    if (!this.bgmFallbackAudio) {
      this.bgmFallbackAudio = new Audio();
      this.bgmFallbackAudio.loop = true;
      this.bgmFallbackAudio.preload = 'auto';
    }
    this.bgmFallbackAudio.volume = Math.min(1, this.bgmVolume * this.masterVolume);
    return this.bgmFallbackAudio;
  }

  /**
   * Fetch and cache a station's current stream URLs.
   *
   * Called ahead of play so the playlist request isn't sitting between the
   * student's switch press and the music starting — an await in that gap
   * spends the user-activation the browser needs to allow playback.
   */
  async prefetchStation(stationIndex: number) {
    const station = this.stations[stationIndex];
    if (!station || this.resolvedUrls.has(station.id)) return;
    this.resolvedUrls.set(station.id, await this.resolveStreamUrls(station));
  }

  async playBGM(stationIndex: number = 0) {
    if (stationIndex === -1) {
      this.stopBGM();
      return;
    }
    const station = this.stations[stationIndex];
    if (!station) return;

    // Already playing this station — don't restart it mid-track.
    if (this.isPlayingBgm && this.currentStationId === station.id) return;

    const token = ++this.loadToken;
    this.currentStationId = station.id;
    this.stationFailed = false;

    // Silence whatever was going, including the no-CORS fallback — otherwise a
    // station change that succeeds on the other element leaves two streams
    // playing over each other.
    this.bgmFallbackAudio?.pause();
    this.bgmAudio?.pause();

    this.ensureBgmElement();
    if (!this.bgmAudio) return;

    // Use cached URLs when we have them so playback starts immediately after
    // the press; only pay for the playlist fetch the first time.
    const urls =
      this.resolvedUrls.get(station.id) ??
      (await (async () => {
        const resolved = await this.resolveStreamUrls(station);
        this.resolvedUrls.set(station.id, resolved);
        return resolved;
      })());

    const attempts: string[] = [];

    for (const url of urls) {
      if (token !== this.loadToken) return; // a newer station was picked
      try {
        await this.tryStream(this.bgmAudio, url);
        if (token !== this.loadToken) return;
        this.usingFallbackAudio = false;
        this.isPlayingBgm = true;
        this.stationFailed = false;
        return;
      } catch (e) {
        attempts.push(`${url} -> ${(e as Error)?.message ?? e}`);
      }
    }

    // Last resort: same streams without CORS. Loses the EQ and the master bus,
    // but a class would rather have music than a visualiser.
    const fallback = this.ensureFallbackElement();
    for (const url of urls) {
      if (token !== this.loadToken) return;
      try {
        await this.tryStream(fallback, url);
        if (token !== this.loadToken) return;
        this.usingFallbackAudio = true;
        this.isPlayingBgm = true;
        this.stationFailed = false;
        return;
      } catch (e) {
        attempts.push(`(no-cors) ${url} -> ${(e as Error)?.message ?? e}`);
      }
    }

    if (token !== this.loadToken) return;
    // Every candidate failed. Say so rather than sitting silent with a track
    // title on screen, which is exactly how the dead MP3 mounts went unnoticed.
    this.isPlayingBgm = false;
    this.stationFailed = true;
    this.lastStationErrors = attempts;
    console.warn(`Station "${station.name}" could not be played:\n` + attempts.join('\n'));
  }

  stopBGM() {
    // Cancel any station still resolving, or it would start playing after this.
    this.loadToken++;
    this.currentStationId = null;
    this.stationFailed = false;
    if (this.bgmFallbackAudio) this.bgmFallbackAudio.pause();
    if (!this.bgmAudio) return;
    this.bgmAudio.pause();
    this.isPlayingBgm = false;
    // Drop the stream but keep the <audio> element and its
    // MediaElementAudioSourceNode alive. An element can only ever be turned
    // into a source node once, so throwing the element away here meant that
    // after any stop the next station played *outside* the analyser graph and
    // the EQ display went dead.
    this.bgmAudio.removeAttribute('src');
    this.bgmAudio.load();
  }

  playNote(midiNote: number, time: number, duration: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, time);
    filter.frequency.exponentialRampToValueAtTime(1200, time + duration * 0.1);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration * 0.9);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.08 * this.sfxVolume, time + duration * 0.1); 
    gain.gain.exponentialRampToValueAtTime(0.01 * this.sfxVolume, time + duration * 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.out());

    osc.start(time);
    osc.stop(time + duration);
  }

  startRoll() {
    if (!this.ctx) this.init();
    if (!this.ctx || this.rollSource) return;
    const ctx = this.ctx;

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.rollSource = ctx.createBufferSource();
    this.rollSource.buffer = buffer;
    this.rollSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400; // Low rumble

    this.rollGain = ctx.createGain();
    this.rollGain.gain.setValueAtTime(0, ctx.currentTime);
    this.rollGain.gain.linearRampToValueAtTime(0.6 * this.sfxVolume, ctx.currentTime + 0.2);

    this.rollSource.connect(filter);
    filter.connect(this.rollGain);
    this.rollGain.connect(this.out());

    this.rollSource.start();
  }

  stopRoll() {
    if (this.rollSource && this.rollGain && this.ctx) {
      this.rollGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
      setTimeout(() => {
        if (this.rollSource) {
          this.rollSource.stop();
          this.rollSource.disconnect();
          this.rollSource = null;
        }
      }, 200);
    }
  }

  playStrike() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Synth thud for lava lamp strike (lower pitch)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6 * this.sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01 * this.sfxVolume, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.out());
    osc.start();
    osc.stop(ctx.currentTime + 0.3);

    // Noise crash (damped)
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 800;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4 * this.sfxVolume, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01 * this.sfxVolume, ctx.currentTime + 0.3);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.out());
    noise.start();
  }

  /**
   * The sweeper crossing the deck: a band of filtered noise that opens up and
   * closes again, under a synth tone that rises and falls with it. Meant to
   * read as machinery made of light rather than a mechanical rake.
   */
  playSweep(durationMs = 650) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = durationMs / 1000;
    const now = ctx.currentTime;

    // Noise band, swept upward then back down.
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.value = 6;
    bandpass.frequency.setValueAtTime(400, now);
    bandpass.frequency.exponentialRampToValueAtTime(2600, now + dur * 0.55);
    bandpass.frequency.exponentialRampToValueAtTime(500, now + dur);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.28 * this.sfxVolume + 0.0001, now + dur * 0.3);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(this.out());
    noise.start(now);

    // Synth tone riding along with it.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + dur * 0.55);
    osc.frequency.exponentialRampToValueAtTime(220, now + dur);

    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = 1800;

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.1 * this.sfxVolume + 0.0001, now + dur * 0.25);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(this.out());
    osc.start(now);
    osc.stop(now + dur);
  }

  /**
   * Rubbery thump for a ball rebounding off a bumper. Pitched up rather than
   * down, so it reads as "still in play" next to the gutter's falling blip.
   */
  playBumper() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35 * this.sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(this.out());
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  /** Hollow descending blip for a ball that drops into the gutter. */
  playGutter() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28 * this.sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(this.out());
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }

  /**
   * Rising arpeggio for a strike or spare. Deliberately short and clearly
   * "good news" — for a lot of these students this is the main feedback that
   * tells them something went right.
   */
  playCelebration(kind: 'strike' | 'spare') {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Major triad up to the octave for a strike, a shorter lift for a spare.
    const notes = kind === 'strike' ? [0, 4, 7, 12, 16] : [0, 4, 7];
    const root = kind === 'strike' ? 69 : 64; // A4 / E4
    const step = 0.085;

    notes.forEach((semitone, i) => {
      const t = ctx.currentTime + i * step;
      const freq = 440 * Math.pow(2, (root + semitone - 69) / 12);

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.16 * this.sfxVolume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      // Soften the square wave so it reads as celebratory rather than harsh.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2600;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.out());
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }
}

export const audioEngine = new RetroAudioEngine();

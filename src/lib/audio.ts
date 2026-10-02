import { loadMusicManifest, musicUrl, type MusicStation, type MusicTrack } from './music';

export type { MusicStation, MusicTrack };


class RetroAudioEngine {
  ctx: AudioContext | null = null;
  isPlayingBgm = false;
  rollSource: AudioBufferSourceNode | null = null;
  rollGain: GainNode | null = null;
  
  bgmAudio: HTMLAudioElement | null = null;
  sfxVolume = 0.8;
  bgmVolume = 0.5;
  masterVolume = 1;
  analyser: AnalyserNode | null = null;
  bgmSource: MediaElementAudioSourceNode | null = null;
  bgmGain: GainNode | null = null;
  freqData: Uint8Array | null = null;

  /** Everything goes through here, so the whole mix can be lifted at once. */
  master: GainNode | null = null;
  limiter: DynamicsCompressorNode | null = null;

  // --- Bundled music ---
  stations: MusicStation[] = [];
  stationIndex = -1;
  trackIndex = 0;
  nowPlaying: MusicTrack | null = null;
  /** Set by the app so the FM display can follow the track. */
  onTrackChange: ((track: MusicTrack | null) => void) | null = null;
  /** Set when tracks.json couldn't be read, so the UI can say so. */
  musicError: string | undefined;
  /** Station has nothing playable, for the UI to report. */
  stationFailed = false;
  /** Consecutive missing files, so a broken station can't loop forever. */
  private consecutiveFailures = 0;

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
    // Level lives on the gain node, not the element, so it can exceed 1.
    if (this.bgmAudio) this.bgmAudio.volume = 1;
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
    // Tracks ship with the game, so these are same-origin: no crossOrigin
    // needed, nothing for a CORS policy to reject, and the analyser can read
    // the signal, which is why the EQ works again.
    this.bgmAudio.loop = false; // the playlist advances instead
    this.bgmAudio.volume = 1;
    this.bgmAudio.preload = 'auto';

    this.bgmAudio.addEventListener('ended', () => this.advanceTrack(1));
    this.bgmAudio.addEventListener('error', () => {
      // A listed file that isn't actually there. Skip past it rather than
      // letting one typo in tracks.json silence the whole station.
      if (this.stationIndex >= 0) {
        console.warn('Could not play', this.nowPlaying?.file);
        this.advanceTrack(1);
      }
    });

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

  /** Read public/music/tracks.json. Safe to call more than once. */
  async loadMusic(): Promise<MusicStation[]> {
    const manifest = await loadMusicManifest();
    this.stations = manifest.stations;
    this.musicError = manifest.error;
    return this.stations;
  }

  /** True when the game has no music to play at all. */
  get hasMusic(): boolean {
    return this.stations.length > 0;
  }

  private setNowPlaying(track: MusicTrack | null) {
    this.nowPlaying = track;
    this.onTrackChange?.(track);
  }

  /**
   * Move `step` tracks through the current station's playlist, wrapping round.
   * Guards against a station whose files are all missing: once every track has
   * failed in a row, stop rather than spinning through them forever.
   */
  private advanceTrack(step: number) {
    const station = this.stations[this.stationIndex];
    if (!station || station.tracks.length === 0) return;

    this.consecutiveFailures++;
    if (this.consecutiveFailures > station.tracks.length) {
      this.stationFailed = true;
      this.isPlayingBgm = false;
      this.setNowPlaying(null);
      return;
    }

    this.trackIndex = (this.trackIndex + step + station.tracks.length) % station.tracks.length;
    void this.playCurrentTrack();
  }

  private async playCurrentTrack() {
    const station = this.stations[this.stationIndex];
    const track = station?.tracks[this.trackIndex];
    if (!track || !this.bgmAudio) return;

    this.setNowPlaying(track);
    this.bgmAudio.src = musicUrl(track.file);
    try {
      await this.bgmAudio.play();
      this.isPlayingBgm = true;
      this.stationFailed = false;
      // Reaching playback clears the run of failures the guard counts.
      this.consecutiveFailures = 0;
    } catch {
      // Autoplay refusal before any interaction is normal; the next switch
      // press will start it. A genuinely bad file raises 'error' instead.
      this.isPlayingBgm = false;
    }
  }

  /** Skip to the next track, e.g. from a UI button. */
  nextTrack() {
    this.consecutiveFailures = 0;
    this.advanceTrack(1);
  }

  /**
   * Start a station, by index into `stations`. -1 stops the music.
   * Named playBGM because that is what the rest of the game calls.
   */
  async playBGM(stationIndex: number = 0) {
    if (stationIndex === -1 || !this.stations[stationIndex]) {
      this.stopBGM();
      return;
    }

    // Already on this station — don't restart the track mid-play.
    if (this.isPlayingBgm && this.stationIndex === stationIndex) return;

    const changingStation = this.stationIndex !== stationIndex;
    this.stationIndex = stationIndex;
    this.stationFailed = false;
    this.consecutiveFailures = 0;
    this.ensureBgmElement();
    if (!this.bgmAudio) return;

    const station = this.stations[stationIndex];
    if (changingStation) {
      // Start somewhere random so the same game doesn't open on the same track
      // every single time.
      this.trackIndex = Math.floor(Math.random() * station.tracks.length);
    }
    await this.playCurrentTrack();
  }

  stopBGM() {
    this.stationIndex = -1;
    this.stationFailed = false;
    this.consecutiveFailures = 0;
    this.setNowPlaying(null);
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

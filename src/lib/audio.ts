class RetroAudioEngine {
  ctx: AudioContext | null = null;
  isPlayingBgm = false;
  rollSource: AudioBufferSourceNode | null = null;
  rollGain: GainNode | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBGM() {
    if (!this.ctx) this.init();
    if (this.isPlayingBgm || !this.ctx) return;
    this.isPlayingBgm = true;

    const ctx = this.ctx;
    const tempo = 115;
    const beatLen = 60 / tempo;

    // 80s Synthwave bassline (16th notes)
    const notes = [
      36, 36, 48, 36, 36, 48, 36, 36, // C2
      39, 39, 51, 39, 39, 51, 39, 39, // Eb2
      34, 34, 46, 34, 34, 46, 34, 34, // Bb1
      41, 41, 53, 41, 41, 53, 41, 41  // F2
    ];
    let noteIdx = 0;
    let nextNoteTime = ctx.currentTime + 0.1;

    const schedule = () => {
      if (!this.isPlayingBgm) return;
      while (nextNoteTime < ctx.currentTime + 0.1) {
        this.playNote(notes[noteIdx], nextNoteTime, beatLen / 4);
        nextNoteTime += beatLen / 4;
        noteIdx = (noteIdx + 1) % notes.length;
      }
      requestAnimationFrame(schedule);
    };
    schedule();
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
    gain.gain.linearRampToValueAtTime(0.08, time + duration * 0.1); // Keep it quiet
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

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
    this.rollGain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + 0.2);

    this.rollSource.connect(filter);
    filter.connect(this.rollGain);
    this.rollGain.connect(ctx.destination);

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

    // Synth "ping" for lava lamp strike
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);

    // Noise crash
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1500;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  }
}

export const audioEngine = new RetroAudioEngine();

export const RADIO_STATIONS = [
  { id: 'u80s', name: 'Underground 80s', url: 'https://ice1.somafm.com/u80s-128-mp3' },
  { id: 'poptron', name: 'PopTron', url: 'https://ice1.somafm.com/poptron-128-mp3' },
  { id: 'groovesalad', name: 'Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'secretagent', name: 'Secret Agent', url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { id: 'defcon', name: 'DEF CON Radio', url: 'https://ice1.somafm.com/defcon-128-mp3' },
  { id: 'spacestation', name: 'Space Station', url: 'https://ice1.somafm.com/spacestation-128-mp3' },
  { id: 'fluid', name: 'Fluid', url: 'https://ice1.somafm.com/fluid-128-mp3' },
  { id: 'dronezone', name: 'Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { id: 'lush', name: 'Lush', url: 'https://ice1.somafm.com/lush-128-mp3' }
];

class RetroAudioEngine {
  ctx: AudioContext | null = null;
  isPlayingBgm = false;
  rollSource: AudioBufferSourceNode | null = null;
  rollGain: GainNode | null = null;
  
  bgmAudio: HTMLAudioElement | null = null;
  sfxVolume = 0.8;

  analyser: AnalyserNode | null = null;
  bgmSource: MediaElementAudioSourceNode | null = null;
  freqData: Uint8Array | null = null;

  stations = RADIO_STATIONS;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  getEQData() {
    if (this.analyser && this.freqData && this.isPlayingBgm) {
      this.analyser.getByteFrequencyData(this.freqData);
      return Array.from(this.freqData);
    }
    return null;
  }

  setBgmVolume(vol: number) {
    if (this.bgmAudio) {
      this.bgmAudio.volume = vol;
    }
  }

  setSfxVolume(vol: number) {
    this.sfxVolume = vol;
  }

  playBGM(stationIndex: number = 0) {
    if (stationIndex === -1) {
      this.stopBGM();
      return;
    }
    
    if (this.isPlayingBgm && this.bgmAudio?.src === this.stations[stationIndex]?.url) return;
    
    // Changing station or initiating
    this.isPlayingBgm = true;

    if (!this.bgmAudio) {
      this.bgmAudio = new Audio();
      this.bgmAudio.crossOrigin = 'anonymous';
      this.bgmAudio.loop = true;
      // Default initial volume before store overrides
      this.bgmAudio.volume = 0.5; 
      
      this.init(); // ensure ctx exists
      if (this.ctx) {
        if (!this.analyser) {
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 64; // 32 bins
          this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        }
        if (!this.bgmSource) {
          try {
            this.bgmSource = this.ctx.createMediaElementSource(this.bgmAudio);
            this.bgmSource.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
          } catch(e) {
            console.warn("Could not create audio node:", e);
          }
        }
      }
    }
    
    if (this.stations[stationIndex]) {
      this.bgmAudio.src = this.stations[stationIndex].url;
      
      this.bgmAudio.play().catch(e => {
          console.warn("BGM play failed", e);
          this.isPlayingBgm = false;
      });
    }
  }

  stopBGM() {
     if (this.bgmAudio) {
         this.bgmAudio.pause();
         this.isPlayingBgm = false;
         this.bgmAudio.src = ''; // Clean up stream
         this.bgmAudio = null;
     }
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
    this.rollGain.gain.linearRampToValueAtTime(0.6 * this.sfxVolume, ctx.currentTime + 0.2);

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
    gain.gain.setValueAtTime(0.4 * this.sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01 * this.sfxVolume, ctx.currentTime + 0.2);

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
    noiseGain.gain.setValueAtTime(0.5 * this.sfxVolume, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01 * this.sfxVolume, ctx.currentTime + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
  }
}

export const audioEngine = new RetroAudioEngine();

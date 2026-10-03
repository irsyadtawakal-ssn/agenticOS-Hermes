/**
 * Sims 2 Office Ambience Audio via Web Audio API.
 * Synthesizes procedural background soundscapes:
 * - HVAC air conditioning & subtle room tone
 * - Keyboard typing clatter proportional to active working agents
 * - Night crickets when outside is dark
 * - Optional The Sims 2 style lounge music (toggleable)
 */

import { simsAudio } from './SimsAudio.ts';

class SimsAmbienceManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private hvacGain: GainNode | null = null;
  private cricketsGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Typing timer
  private nextTypeTime = 0;

  // Night crickets timer
  private nextCricketTime = 0;

  // Music state
  private musicEnabled = false;
  private musicStep = 0;
  private nextMusicTime = 0;

  // State
  private isNight = false;

  constructor() {
    try {
      const savedMusic = localStorage.getItem('aos.sims.music');
      this.musicEnabled = savedMusic === 'true';
    } catch {
      this.musicEnabled = false;
    }

    // Attach unlock gesture listener
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.ensureContext();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (simsAudio.isMuted()) return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.setupNodes();
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  private setupNodes(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Master ambience gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(simsAudio.isMuted() ? 0 : 0.6, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // 1. HVAC Room Tone (low hum + brown noise)
    this.setupHvac();

    // 2. Night Crickets
    this.setupCrickets();

    // 3. Music Gain
    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(this.musicEnabled ? 0.15 : 0, ctx.currentTime);
    this.musicGain.connect(this.masterGain);
  }

  private setupHvac(): void {
    if (!this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    this.hvacGain = ctx.createGain();
    this.hvacGain.gain.setValueAtTime(0.015, ctx.currentTime);

    // Filtered noise for air rushing
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(140, ctx.currentTime);

    whiteNoise.connect(lowpass);
    lowpass.connect(this.hvacGain);
    whiteNoise.start();

    // Subtle 60Hz transformer / server hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(60, ctx.currentTime);

    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.008, ctx.currentTime);
    hum.connect(humGain);
    humGain.connect(this.hvacGain);
    hum.start();

    this.hvacGain.connect(this.masterGain);
  }

  private setupCrickets(): void {
    if (!this.ctx || !this.masterGain) return;
    this.cricketsGain = this.ctx.createGain();
    this.cricketsGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.cricketsGain.connect(this.masterGain);
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    try {
      localStorage.setItem('aos.sims.music', String(enabled));
    } catch {
      // ignore
    }

    if (this.ctx && this.musicGain) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.setTargetAtTime(enabled ? 0.15 : 0, now, 0.5);
    }
  }

  public toggleMusic(): boolean {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  /** Advance ambience state per frame */
  public update(_dt: number, workingCount: number, nightFactor: number): void {
    if (simsAudio.isMuted()) {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== 'running') return;

    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(0.6, ctx.currentTime);
    }

    this.isNight = nightFactor > 0.6;

    // Adjust crickets volume smoothly
    if (this.cricketsGain) {
      const targetCrickets = this.isNight ? (nightFactor - 0.6) * 0.08 : 0;
      this.cricketsGain.gain.setTargetAtTime(targetCrickets, ctx.currentTime, 1.0);
    }

    const now = ctx.currentTime;

    // 1. Play keyboard clicks
    if (now >= this.nextTypeTime) {
      if (workingCount > 0) {
        this.playKeyboardClick(ctx);
        // Faster rate when more agents are working
        const interval = Math.max(0.08, (0.45 / Math.sqrt(workingCount)) + (Math.random() * 0.15 - 0.07));
        this.nextTypeTime = now + interval;
      } else {
        // Occasional stray keypress
        this.nextTypeTime = now + 4.0 + Math.random() * 8.0;
      }
    }

    // 2. Night cricket chirps
    if (this.isNight && now >= this.nextCricketTime) {
      this.playCricketChirp(ctx);
      this.nextCricketTime = now + 1.2 + Math.random() * 2.5;
    }

    // 3. Lounge Music Loop
    if (this.musicEnabled && now >= this.nextMusicTime) {
      this.playMusicStep(ctx, now);
      this.nextMusicTime = now + 0.5; // Eighth note step (120 BPM)
      this.musicStep = (this.musicStep + 1) % 32;
    }
  }

  private playKeyboardClick(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200 + Math.random() * 1200, ctx.currentTime);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400 + Math.random() * 200, ctx.currentTime);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.012 + Math.random() * 0.015, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain ?? ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  private playCricketChirp(ctx: AudioContext): void {
    if (!this.cricketsGain) return;
    const now = ctx.currentTime;
    const bursts = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < bursts; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(4500 + Math.random() * 300, t);

      gain.gain.setValueAtTime(0.025, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

      osc.connect(gain);
      gain.connect(this.cricketsGain);

      osc.start(t);
      osc.stop(t + 0.05);
    }
  }

  /** Cozy The Sims style jazz/lounge progression (Fmaj7 - G7 - Em7 - Am7) */
  private playMusicStep(ctx: AudioContext, now: number): void {
    if (!this.musicGain) return;

    // Chords on beats 0, 8, 16, 24
    // Fmaj7: F3(174.6), A3(220), C4(261.6), E4(329.6)
    // G7:    G3(196), B3(246.9), D4(293.7), F4(349.2)
    // Em7:   E3(164.8), G3(196), B3(246.9), D4(293.7)
    // Am7:   A3(220), C4(261.6), E4(329.6), G4(392)
    const chords = [
      [174.6, 220.0, 261.6, 329.6], // Fmaj7
      [196.0, 246.9, 293.7, 349.2], // G7
      [164.8, 196.0, 246.9, 293.7], // Em7
      [220.0, 261.6, 329.6, 392.0], // Am7
    ];

    const chordIdx = Math.floor(this.musicStep / 8);
    const stepInChord = this.musicStep % 8;

    // Play chord pad on beat 0 of each bar
    if (stepInChord === 0) {
      const chord = chords[chordIdx];
      for (const freq of chord) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.015, now);
        gain.gain.linearRampToValueAtTime(0.02, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        osc.connect(gain);
        gain.connect(this.musicGain);

        osc.start(now);
        osc.stop(now + 4.0);
      }
    }

    // Gentle bassline on beats 0, 4 of each chord
    if (stepInChord === 0 || stepInChord === 4) {
      const rootBass = [87.3, 98.0, 82.4, 110.0][chordIdx]; // F2, G2, E2, A2
      const bassFreq = stepInChord === 4 ? rootBass * 1.5 : rootBass;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassFreq, now);

      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + 0.8);
    }

    // Melodic vibraphone plucks occasionally (pentatonic)
    const melodyScale = [523.25, 587.33, 659.25, 783.99, 880.0]; // C5, D5, E5, G5, A5
    if (this.musicStep % 2 === 1 && Math.random() < 0.6) {
      const freq = melodyScale[Math.floor(Math.random() * melodyScale.length)];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.45);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + 0.5);
    }
  }
}

export const simsAmbience = new SimsAmbienceManager();

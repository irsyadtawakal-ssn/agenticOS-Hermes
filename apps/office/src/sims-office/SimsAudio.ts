/**
 * The Sims 2 Audio Effects via Web Audio API.
 * Synthesizes classic simulation sound effects:
 * - UI Click / Button snap
 * - Camera rotate whoosh
 * - Coffee machine brewing
 * - Plumbob chime / Approval alert
 * - Task complete happy jingle
 */

class SimsAudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean = false;
  private volume: number = 0.8;

  constructor() {
    try {
      const saved = localStorage.getItem('aos.sims.muted');
      if (saved !== null) {
        this.muted = saved === 'true';
      }
      const savedVol = localStorage.getItem('aos.sims.volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.volume = v;
        }
      }
    } catch {
      // defaults to unmuted
    }
  }

  private initCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem('aos.sims.muted', String(muted));
    } catch {
      // ignore
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    try {
      localStorage.setItem('aos.sims.volume', String(this.volume));
    } catch {
      // ignore
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  private getOutNode(ctx: AudioContext): AudioNode {
    return this.masterGain ?? ctx.destination;
  }

  /** Subtle UI click */
  public playClick(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.getOutNode(ctx));

    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Camera 90-degree rotate sound */
  public playRotate(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.getOutNode(ctx));

    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Coffee machine brewing */
  public playCoffee(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Bubbling sound using modulated noise/oscillator
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.09;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400 + Math.random() * 300, t);
      osc.frequency.exponentialRampToValueAtTime(600 + Math.random() * 200, t + 0.07);

      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.08);
    }
  }

  /** Approval required alert chime */
  public playAlert(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [440, 554.37, 659.25]; // A4, C#5, E5 (A Major)
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  /** Task complete happy jingle */
  public playSuccess(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const melody = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    melody.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.07;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  /** Broadcast / Chat All sound - resonant intercom / announcement chime */
  public playBroadcast(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const tones = [698.46, 880.0]; // F5 then A5
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  /** Bouncy The Sims 2 UI bubble click */
  public playBubbleClick(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(this.getOutNode(ctx));

    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Crisp plastic binder/tab snap sound */
  public playTabSwitch(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    [
      { freq: 1100, delay: 0 },
      { freq: 1600, delay: 0.022 },
    ].forEach(({ freq, delay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + delay;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(500, t + 0.025);

      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.028);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.03);
    });
  }

  /** Cheerful major-third Sim selection chime (A5 -> C#6) */
  public playSelectSim(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [880, 1108.73]; // A5, C#6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.075;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /** Low motive / critical need warning alert */
  public playMotiveAlert(): void {
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const tones = [698.46, 587.33]; // F5, D5 (descending minor)
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.1;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(this.getOutNode(ctx));

      osc.start(t);
      osc.stop(t + 0.27);
    });
  }
}

export const simsAudio = new SimsAudioManager();

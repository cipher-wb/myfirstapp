export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private started = false;
  private madness = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  start() {
    if (this.started) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    this.master = master;

    // === AMBIENT DRONE ===
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0, ctx.currentTime);
    droneGain.connect(master);
    this.droneGain = droneGain;

    this.droneOsc1 = ctx.createOscillator();
    this.droneOsc1.type = "sine";
    this.droneOsc1.frequency.value = 65;
    this.droneOsc1.connect(droneGain);
    this.droneOsc1.start();

    this.droneOsc2 = ctx.createOscillator();
    this.droneOsc2.type = "sine";
    this.droneOsc2.frequency.value = 130;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.25;
    this.droneOsc2.connect(harmGain);
    harmGain.connect(droneGain);
    this.droneOsc2.start();

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = 32.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;
    sub.connect(subGain);
    subGain.connect(droneGain);
    sub.start();

    // breathing LFO
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 0.12;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.1;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(droneGain.gain);
    this.lfo.start();

    droneGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 4);

    // === NOISE TEXTURE ===
    const bufLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "lowpass";
    this.noiseFilter.frequency.value = 180;
    this.noiseFilter.Q.value = 0.7;

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.05;

    noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(master);
    noiseSrc.start();

    this.started = true;
  }

  updateMadness(level: number) {
    if (!this.ctx || !this.started) return;
    this.madness = level;
    const t = this.ctx.currentTime + 0.1;

    this.droneOsc1?.frequency.linearRampToValueAtTime(65 + level * 50, t);
    this.droneOsc2?.frequency.linearRampToValueAtTime(130 + level * 80, t);
    this.lfo?.frequency.linearRampToValueAtTime(0.12 + level * 4, t);
    this.lfoGain?.gain.linearRampToValueAtTime(0.1 + level * 0.35, t);
    this.droneGain?.gain.linearRampToValueAtTime(0.2 + level * 0.15, t);
    this.noiseGain?.gain.linearRampToValueAtTime(0.05 + level * 0.15, t);
    this.noiseFilter?.frequency.linearRampToValueAtTime(180 + level * 2500, t);

    if (level > 0.15 && !this.heartbeatTimer) {
      this.scheduleHeartbeat();
    }
  }

  private scheduleHeartbeat() {
    if (!this.ctx || !this.started) return;
    const interval = Math.max(200, 900 - this.madness * 700);
    this.heartbeatTimer = setTimeout(() => {
      if (!this.started) return;
      this.playHeartbeat();
      if (this.madness > 0.1) {
        this.scheduleHeartbeat();
      } else {
        this.heartbeatTimer = null;
      }
    }, interval);
  }

  private playHeartbeat() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const vol = 0.12 * Math.min(this.madness, 1);

    const o1 = this.ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 55;
    const g1 = this.ctx.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(vol, now + 0.015);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o1.connect(g1);
    g1.connect(this.master);
    o1.start(now);
    o1.stop(now + 0.12);

    const o2 = this.ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 40;
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(0, now + 0.1);
    g2.gain.linearRampToValueAtTime(vol * 0.7, now + 0.115);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    o2.connect(g2);
    g2.connect(this.master);
    o2.start(now + 0.1);
    o2.stop(now + 0.25);
  }

  playWordBurst() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;

    const len = Math.floor(this.ctx.sampleRate * 0.1);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1200;
    f.Q.value = 2;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + 0.1);

    const plink = this.ctx.createOscillator();
    plink.type = "sine";
    plink.frequency.value = 500 + Math.random() * 500;
    const pg = this.ctx.createGain();
    pg.gain.setValueAtTime(0.05, now);
    pg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    plink.connect(pg);
    pg.connect(this.master);
    plink.start(now);
    plink.stop(now + 0.15);
  }

  triggerExplosion() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;

    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // noise crash
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 2);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(5000, now);
    f.frequency.exponentialRampToValueAtTime(80, now + 2);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + 2);

    // low boom
    const boom = this.ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(90, now);
    boom.frequency.exponentialRampToValueAtTime(20, now + 1);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.3, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 1);
    boom.connect(bg);
    bg.connect(this.master);
    boom.start(now);
    boom.stop(now + 1);

    // fade out LFO modulation first (it modulates droneGain, must silence it)
    this.lfoGain?.gain.linearRampToValueAtTime(0, now + 0.8);
    this.droneGain?.gain.linearRampToValueAtTime(0, now + 2);
    this.noiseGain?.gain.linearRampToValueAtTime(0, now + 1);
  }

  playEndingTone() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const base = 220;
    const partials = [
      { r: 1, v: 0.1, d: 12 },
      { r: 2.76, v: 0.05, d: 9 },
      { r: 4.72, v: 0.025, d: 7 },
    ];
    for (const p of partials) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * p.r;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(p.v, now + 2.5);
      g.gain.setValueAtTime(p.v, now + 3.5);
      g.gain.exponentialRampToValueAtTime(0.001, now + p.d);
      o.connect(g);
      g.connect(this.master!);
      o.start(now);
      o.stop(now + p.d);
    }
  }

  reset() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const oldCtx = this.ctx;
    if (oldCtx && this.master) {
      this.master.gain.linearRampToValueAtTime(0, oldCtx.currentTime + 0.3);
      setTimeout(() => {
        try {
          oldCtx.close();
        } catch {}
      }, 500);
    }
    this.ctx = null;
    this.master = null;
    this.started = false;
    this.madness = 0;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneGain = null;
    this.noiseGain = null;
    this.noiseFilter = null;
    this.lfo = null;
    this.lfoGain = null;
  }
}

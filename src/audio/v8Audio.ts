export class M840trAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private v8Gain: GainNode | null = null;
  private oscPrimary: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private exhaustFilter: BiquadFilterNode | null = null;

  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabled = false;
  private prevRpm = 900;
  private prevThrottle = 0;
  private lastFlutterAt = 0;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public async enable(): Promise<boolean> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.setupGraph();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.enabled = true;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.08);
    }
    return true;
  }

  public disable(): void {
    this.enabled = false;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.06);
    }
  }

  public async toggle(): Promise<boolean> {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return this.enable();
  }

  private setupGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.0;
    this.masterGain.connect(ctx.destination);

    // Reusable 2-second white/pink noise buffer for turbo, wind tunnel & overrun crackles
    const bufLen = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }

    // 1. Flat-Plane Crank 4.0L V8 Combustion Bank
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 2.8);
    }
    shaper.curve = curve;

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.frequency.value = 520;
    this.exhaustFilter.Q.value = 2.4;

    const chestEq = ctx.createBiquadFilter();
    chestEq.type = 'peaking';
    chestEq.frequency.value = 118;
    chestEq.Q.value = 1.4;
    chestEq.gain.value = 7.5;

    this.v8Gain = ctx.createGain();
    this.v8Gain.gain.value = 0.22;

    this.oscPrimary = ctx.createOscillator();
    this.oscPrimary.type = 'sawtooth';
    this.oscPrimary.frequency.value = 60;

    this.oscSub = ctx.createOscillator();
    this.oscSub.type = 'triangle';
    this.oscSub.frequency.value = 30;

    this.oscHarmonic = ctx.createOscillator();
    this.oscHarmonic.type = 'sawtooth';
    this.oscHarmonic.frequency.value = 120.5;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.55;
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.35;

    this.oscPrimary.connect(shaper);
    this.oscSub.connect(subGain);
    subGain.connect(shaper);
    this.oscHarmonic.connect(harmGain);
    harmGain.connect(shaper);

    shaper.connect(this.exhaustFilter);
    this.exhaustFilter.connect(chestEq);
    chestEq.connect(this.v8Gain);
    this.v8Gain.connect(this.masterGain);

    this.oscPrimary.start();
    this.oscSub.start();
    this.oscHarmonic.start();

    // 2. Twin-Scroll Turbocharger Compressor Whistle
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboOsc.frequency.value = 2200;

    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0.0;

    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.masterGain);
    this.turboOsc.start();

    // 3. Woking CFD Wind-Tunnel Laminar Airflow Layer
    const windSource = ctx.createBufferSource();
    windSource.buffer = this.noiseBuffer;
    windSource.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 1.1;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;

    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSource.start();
  }

  public update(params: {
    rpm: number;
    throttle: number; // 0..1
    boostBar: number; // 0..1.42
    windIntensity: number; // 0..1
    windSpeedKmh: number;
  }): void {
    if (!this.enabled || !this.ctx || !this.oscPrimary || !this.oscSub || !this.oscHarmonic || !this.exhaustFilter || !this.v8Gain || !this.turboOsc || !this.turboGain || !this.windFilter || !this.windGain) {
      return;
    }

    const now = this.ctx.currentTime;
    const rpm = Math.max(850, Math.min(8600, params.rpm));
    // 90-deg flat-plane V8 firing frequency = 4 ignitions per revolution
    const f0 = (rpm / 60) * 4;

    this.oscPrimary.frequency.setTargetAtTime(f0, now, 0.025);
    this.oscSub.frequency.setTargetAtTime(f0 * 0.5, now, 0.025);
    this.oscHarmonic.frequency.setTargetAtTime(f0 * 2.005, now, 0.025);

    const cutoff = 380 + Math.pow((rpm - 850) / 7650, 1.25) * 3400 + params.throttle * 1100;
    this.exhaustFilter.frequency.setTargetAtTime(cutoff, now, 0.03);

    const v8Level = 0.14 + params.throttle * 0.28 + ((rpm - 850) / 7650) * 0.22;
    this.v8Gain.gain.setTargetAtTime(v8Level, now, 0.035);

    // Twin-turbo compressor spool whistle
    const normBoost = Math.max(0, Math.min(1, params.boostBar / 1.42));
    this.turboOsc.frequency.setTargetAtTime(2100 + normBoost * 4650, now, 0.04);
    this.turboGain.gain.setTargetAtTime(normBoost * normBoost * 0.045, now, 0.04);

    // CFD wind-tunnel / high-speed slipstream roar
    const windFreq = 260 + (params.windSpeedKmh / 340) * 680;
    this.windFilter.frequency.setTargetAtTime(windFreq, now, 0.06);
    this.windGain.gain.setTargetAtTime(params.windIntensity * 0.26, now, 0.06);

    // Detect sharp throttle lift from high RPM -> trigger wastegate flutter & Inconel overrun crackles!
    if (
      this.prevThrottle > 0.55 &&
      params.throttle < 0.2 &&
      this.prevRpm > 4300 &&
      now - this.lastFlutterAt > 0.55
    ) {
      this.lastFlutterAt = now;
      this.triggerWastegateAndCrackles();
    }

    this.prevRpm = rpm;
    this.prevThrottle = params.throttle;
  }

  public triggerUpshiftBark(): void {
    if (!this.enabled || !this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    // Crisp 7-speed SSG ignition-cut upshift thump
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.09);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  private triggerWastegateAndCrackles(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Twin-turbo wastegate compressor flutter ("stu-tu-tu-tu")
    for (let pulse = 0; pulse < 4; pulse++) {
      const t0 = now + pulse * 0.072;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600 - pulse * 290;
      bp.Q.value = 5.5;

      const g = ctx.createGain();
      const amp = 0.20 * Math.pow(0.72, pulse);
      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.062);

      src.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      src.start(t0, Math.random() * 0.5, 0.07);
    }

    // 2. Three Inconel top-exit exhaust overrun crackles
    for (let c = 0; c < 3; c++) {
      const t0 = now + 0.14 + c * 0.11 + Math.random() * 0.04;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 680 + Math.random() * 520;
      hp.Q.value = 2.2;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.055);

      src.connect(hp);
      hp.connect(g);
      g.connect(this.masterGain);
      src.start(t0, Math.random() * 0.8, 0.06);
    }
  }
}

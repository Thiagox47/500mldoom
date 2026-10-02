export class Sfx {
  private ac: AudioContext | null = null;

  init(): void {
    if (this.ac) return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) this.ac = new AC();
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const osc = this.ac.createOscillator();
    const gain = this.ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number): void {
    if (!this.ac) return;
    const len = Math.floor(this.ac.sampleRate * dur);
    const buffer = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ac.createBufferSource();
    src.buffer = buffer;
    const filter = this.ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ac.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ac.destination);
    src.start();
  }

  fire(): void {
    this.noise(0.18, 0.5, 1400);
    this.tone(140, 0.14, 'square', 0.25, 40);
  }

  dry(): void {
    this.tone(900, 0.04, 'square', 0.08);
  }

  hit(): void {
    this.tone(240, 0.09, 'sawtooth', 0.22, 100);
  }

  hurt(): void {
    this.tone(150, 0.22, 'sawtooth', 0.3, 60);
  }

  pickup(): void {
    this.tone(520, 0.08, 'square', 0.18);
    this.tone(780, 0.1, 'square', 0.18, undefined, 0.07);
  }

  enemyDie(): void {
    this.tone(320, 0.35, 'sawtooth', 0.26, 50);
    this.noise(0.25, 0.3, 600);
  }

  menuSelect(): void {
    this.tone(680, 0.035, 'square', 0.08);
  }

  menuConfirm(): void {
    this.tone(380, 0.06, 'sawtooth', 0.14, 820);
  }
}

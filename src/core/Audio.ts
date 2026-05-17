export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lowPass: BiquadFilterNode | null = null;
  private heartbeatOsc: OscillatorNode | null = null;
  private isInitialized = false;

  public async resume() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  private init() {
    if (this.isInitialized) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.2;
    
    this.lowPass = this.ctx.createBiquadFilter();
    this.lowPass.type = 'lowpass';
    this.lowPass.frequency.value = 2000;

    this.masterGain.connect(this.lowPass);
    this.lowPass.connect(this.ctx.destination);
    
    this.isInitialized = true;
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (!this.ctx || !this.masterGain) return;
    this.heartbeatOsc = this.ctx.createOscillator();
    this.heartbeatOsc.type = 'sine';
    this.heartbeatOsc.frequency.value = 60;
    
    const hbGain = this.ctx.createGain();
    hbGain.gain.value = 0;
    
    this.heartbeatOsc.connect(hbGain);
    hbGain.connect(this.masterGain);
    this.heartbeatOsc.start();

    const pulse = () => {
      if (!this.ctx || !this.isInitialized || this.ctx.state !== 'running') {
        setTimeout(pulse, 500);
        return;
      }
      const now = this.ctx.currentTime;
      hbGain.gain.setTargetAtTime(0.3, now, 0.01);
      hbGain.gain.setTargetAtTime(0, now + 0.1, 0.05);
      
      const interval = 1000 / (1 + (this.tempoScale || 0) * 0.1);
      setTimeout(pulse, interval);
    };
    pulse();
  }

  private tempoScale = 0;
  private lastTargetFreq = 0;
  public updateHeartbeat(score: number, dangerDist: number) {
    if (!this.isInitialized || !this.lowPass || this.ctx?.state !== 'running') return;
    this.tempoScale = score / 50;
    const targetFrequency = 400 + Math.min(dangerDist / 10, 1) * 1600;
    const safeFrequency = Math.max(20, Math.min(20000, targetFrequency));
    if (Math.abs(safeFrequency - this.lastTargetFreq) > 5) {
      this.lowPass.frequency.setTargetAtTime(safeFrequency, this.ctx!.currentTime, 0.1);
      this.lastTargetFreq = safeFrequency;
    }
  }

  private canPlay(): boolean {
    return this.isInitialized && this.ctx?.state === 'running';
  }

  public playTicker() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'square';
    osc.frequency.value = 800;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + 0.05);
    osc.stop(this.ctx!.currentTime + 0.05);
  }

  public playTurn() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = 150;
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + 0.1);
    osc.stop(this.ctx!.currentTime + 0.1);
  }

  public playEat() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx!.currentTime + 0.1);
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + 0.2);
    osc.stop(this.ctx!.currentTime + 0.2);
  }

  public playDeath() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx!.currentTime + 0.5);
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 0.5);
    osc.stop(this.ctx!.currentTime + 0.5);
  }

  public playRewind() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, this.ctx!.currentTime);
    osc.frequency.linearRampToValueAtTime(1000, this.ctx!.currentTime + 0.5);
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 0.5);
    osc.stop(this.ctx!.currentTime + 0.5);
  }

  public playTransition() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, this.ctx!.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, this.ctx!.currentTime + 1);
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 1);
    osc.stop(this.ctx!.currentTime + 1);
  }

  public playGlitch() {
    if (!this.canPlay()) return;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.random() * 1000, this.ctx!.currentTime);
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start();
    gain.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 0.1);
    osc.stop(this.ctx!.currentTime + 0.1);
  }
}

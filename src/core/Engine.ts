import type { EngineConfig } from '../Types';

export class Engine {
  private lastTime: number = 0;
  private accumulator: number = 0;
  private logicTickRate: number;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  private onLogicTick: () => void;
  private onRenderTick: (alpha: number) => void;

  constructor(
    config: EngineConfig,
    onLogicTick: () => void,
    onRenderTick: (alpha: number) => void
  ) {
    this.logicTickRate = 1000 / config.logicFps;
    this.onLogicTick = onLogicTick;
    this.onRenderTick = onRenderTick;
  }

  public setLogicFps(fps: number): void {
    this.logicTickRate = 1000 / fps;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  public stop(): void {
    this.isRunning = false;
  }

  private loop(currentTime: number): void {
    if (!this.isRunning) return;

    let deltaTime = currentTime - this.lastTime;
    
    // Safety Guard: Reset if delta is too large (e.g. browser tab suspended)
    if (deltaTime > 100) deltaTime = 16;
    
    this.lastTime = currentTime;

    if (!this.isPaused) {
      this.accumulator += deltaTime;

      while (this.accumulator >= this.logicTickRate) {
        this.onLogicTick();
        this.accumulator -= this.logicTickRate;
      }
    }

    // High-End Interpolation (Lerp)
    const alpha = this.accumulator / this.logicTickRate;
    this.onRenderTick(Math.max(0, Math.min(1, alpha)));

    requestAnimationFrame(this.loop.bind(this));
  }
}

import { GameStatus, BiomeType, GlitchType } from '../Types';
import type { GameState, Point, Snapshot } from '../Types';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private gridWidth: number;
  private gridHeight: number;
  private cellSize: number = 0;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private particles: any[] = [];
  private voidParticles: { angle: number; radius: number; speed: number; size: number; opacity: number }[] = [];
  private frameCount: number = 0;
  private glitchTime: number = 0;
  private turnWobble: number = 0;
  private transitionProgress: number = 0;
  private shakeTime: number = 0;
  private resumeFlashTime: number = 0;
  private biomeFlashTime: number = 0;
  private baseHue: number = 180;
  private accentColor: string = '#00f2ff'; // High-End Tech-Noir Cyan
  private secondaryAccent: string = '#008a91';
  private chronosColor: string = '#BF00FF'; // Electric Purple
  private voidCache: HTMLCanvasElement | null = null;

  // Min/max cell size in pixels for consistent cross-device feel
  private static readonly MIN_CELL = 14;
  private static readonly MAX_CELL = 28;

  constructor(canvas: HTMLCanvasElement, gridWidth: number, gridHeight: number) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    // High-Performance Pixel Crush Buffer (Locked to Logic Grid)
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = gridWidth;
    this.offscreenCanvas.height = gridHeight;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false })!;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('biome-shift', () => { this.biomeFlashTime = 60; });
  }

  public resize(width?: number, height?: number): void {
    if (width) this.gridWidth = width;
    if (height) this.gridHeight = height;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Clamp cellSize for consistent feel on all screen sizes:
    // - Too large on widescreen laptops, too small on narrow phones without this.
    const rawCell = window.innerWidth / this.gridWidth;
    const clampedCell = Math.min(Renderer.MAX_CELL, Math.max(Renderer.MIN_CELL, rawCell));

    // Recalculate grid dimensions, then snap cellSize to fill the width exactly.
    // This eliminates the fractional-pixel bars on left & right.
    this.gridWidth  = Math.floor(window.innerWidth  / clampedCell);
    this.gridHeight = Math.floor(window.innerHeight / clampedCell);
    this.cellSize   = window.innerWidth / this.gridWidth; // fills width with zero gap

    this.offscreenCanvas.width  = this.gridWidth;
    this.offscreenCanvas.height = this.gridHeight;

    // No horizontal offset — grid fills full width.
    // A tiny bottom gap may remain (acceptable).
    this.offsetX = 0;
    this.offsetY = (window.innerHeight - this.gridHeight * this.cellSize) / 2;

    this.createVoidCache();
    this.initVoidParticles();
    window.dispatchEvent(new CustomEvent('resize-cell', { detail: this.cellSize }));
    window.dispatchEvent(new CustomEvent('resize-grid', { detail: { w: this.gridWidth, h: this.gridHeight } }));
  }

  private createVoidCache(): void {
    // Keep the cache for potential future use; void is now rendered live for animation.
    this.voidCache = null;
  }

  private initVoidParticles(): void {
    // Populate a field of stars/debris that orbit and spiral into the black hole.
    this.voidParticles = [];
    const count = 80;
    const maxR  = this.cellSize * 9; // outer spawn radius (grid units)
    const minR  = this.cellSize * 3; // inner pull radius
    for (let i = 0; i < count; i++) {
      const radius = minR + Math.random() * (maxR - minR);
      this.voidParticles.push({
        angle:   Math.random() * Math.PI * 2,
        radius,
        speed:   (0.004 + Math.random() * 0.008) * (maxR / radius), // faster near center
        size:    0.5 + Math.random() * 1.5,
        opacity: 0.3 + Math.random() * 0.7,
      });
    }
  }

  public triggerGlitch(): void { this.glitchTime = 15; }
  public triggerTurnWobble(): void { this.turnWobble = 1.0; }
  public triggerScreenShake(): void { this.shakeTime = 10; }
  public triggerResumeFlash(): void { this.resumeFlashTime = 10; }
  public setTransitionProgress(p: number): void { this.transitionProgress = Math.min(1, Math.max(0, p)); }

  private getHue(score: number): number { return (this.baseHue + score * 0.5) % 360; }

  public render(state: GameState, prevState: GameState, alpha: number, snapshots: Snapshot[] = []): void {
    this.frameCount++;
    
    // Coordinate System Protection: Reset transforms at start of frame
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    const hue = this.getHue(state.score);
    const isCrushed = state.glitch === GlitchType.CRUSH && state.glitchAge > 3; // 200ms delay

    this.ctx.save();
    
    // Apply Viewport Centering
    this.ctx.translate(this.offsetX, this.offsetY);
    
    // Initial Clear & Arena Vignette
    this.ctx.fillStyle = '#050505';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const vignette = this.ctx.createRadialGradient(
      this.canvas.width / 2, this.canvas.height / 2, 0,
      this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.8
    );
    vignette.addColorStop(0, '#0a0a0a');
    vignette.addColorStop(1, '#000000');
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.shakeTime > 0) {
      this.ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      this.shakeTime--;
    }

    if (this.turnWobble > 0) this.turnWobble *= 0.9;

    this.renderScanLine(this.ctx, this.canvas);

    if (state.status === GameStatus.BOOT) { 
      this.renderBootSequence(this.ctx, this.canvas); 
      this.ctx.restore(); 
      return; 
    }

    // GPU_OPTIMIZATION: Removed ctx.filter (Blur/Grayscale Tax)
    if (state.isBulletTime) this.ctx.globalAlpha = 0.8; 
    else this.ctx.globalAlpha = 1.0;

    if (this.glitchTime > 0) { 
      this.ctx.translate(Math.random() * 20 - 10, 0); 
      this.glitchTime--; 
    }

    if (state.status === GameStatus.TRANSITION_IN) {
      const scale = 0.8 + this.transitionProgress * 0.2;
      this.ctx.translate((this.canvas.width * (1 - scale)) / 2, (this.canvas.width * (1 - scale)) / 2);
      this.ctx.scale(scale, scale);
    }

    if (state.status === GameStatus.REWINDING && Math.random() > 0.8) this.ctx.globalAlpha = 0.5;
    this.renderGrid(this.ctx, this.canvas, state.status, state.biome);
    this.ctx.globalAlpha = 1.0;

    if (state.biome === BiomeType.VOID || state.isBiomeWarning) this.renderBlackHole(this.ctx, this.canvas, state);
    if (state.biome === BiomeType.MIRROR) this.renderMirrorDivider(this.ctx, this.canvas);

    if (state.status === GameStatus.TRANSITION_IN) {
      this.renderTransitionIn(this.ctx, this.canvas, state.snake, hue);
      this.ctx.restore(); 
      return; 
    }

    this.ctx.globalCompositeOperation = 'lighter';

    this.updateAndRenderParticles(this.ctx, hue, state.biome, state.status);

    if (state.status === GameStatus.REWINDING) this.renderRewindEffect(this.ctx, this.canvas);

    // GHOST_TRAIL: Subtle After-Images (Last 3 frames)
    if (state.status === GameStatus.PLAYING && !isCrushed) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.05;
      const trailLimit = Math.min(snapshots.length, 3);
      for (let i = 1; i <= trailLimit; i++) {
        const snap = snapshots[snapshots.length - i];
        this.renderSnakeRibbon(this.ctx, snap.state.snake, snap.state.snake, 1, hue, true, false, 0, state.biome, snap.state.direction, false, false);
      }
      this.ctx.restore();
    }

    // PIXEL_CRUSH & INVERT: Re-enabled
    if (isCrushed) {
      this.offscreenCtx.clearRect(0, 0, this.gridWidth, this.gridHeight);
      
      const originalCellSize = this.cellSize;
      this.cellSize = 1; // 1:1 Mapping to logic grid
      
      this.renderOptimizedFood(this.offscreenCtx, state.food, true);
      if (state.glitchBit) this.renderGlitchBit(this.offscreenCtx, state.glitchBit!);
      this.renderSnakeRibbon(this.offscreenCtx, state.snake, prevState.snake, alpha, hue, false, true, state.invincibilityTimeLeft, state.biome, state.direction, state.isBulletTime, false);
      
      this.cellSize = originalCellSize;

      // Draw back upscaled with crisp filtering
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.gridWidth, this.gridHeight, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.imageSmoothingEnabled = true;
    } else if (state.status !== GameStatus.MENU) {
      this.renderOptimizedFood(this.ctx, state.food, false);
      if (state.glitchBit) this.renderGlitchBit(this.ctx, state.glitchBit);
      if (state.rivalSnake) this.renderSnakeRibbon(this.ctx, state.rivalSnake, state.rivalSnake, 1, 280, false, false, 0, state.biome, state.rivalDirection, false, false);
      
      if (state.biome === BiomeType.MIRROR) {
        const mirrorSnake = state.snake.map(s => ({ x: this.gridWidth - 1 - s.x, y: s.y }));
        this.renderSnakeRibbon(this.ctx, mirrorSnake, mirrorSnake, 1, 20, false, false, 0, state.biome, state.direction, state.isBulletTime, state.glitch === GlitchType.PHANTOM);
      }

      if (state.status === GameStatus.REWINDING || state.glitch === GlitchType.WARP) {
        if (state.status === GameStatus.REWINDING) this.renderGhostPath(this.ctx, snapshots);
        const shift = state.glitch === GlitchType.WARP ? 8 : 4;
        this.renderChromaticSnake(this.ctx, state.snake, prevState.snake, alpha, hue, shift, false, state.isBulletTime);
      } else {
        if (state.isAutopilot) {
          for (let i = 1; i <= 3; i++) {
            this.ctx.globalAlpha = 0.1 / i; this.ctx.save();
            this.ctx.translate(Math.sin(this.frameCount * 0.2) * i * 2, Math.cos(this.frameCount * 0.2) * i * 2);
            this.renderSnakeRibbon(this.ctx, state.snake, prevState.snake, alpha, hue, true, false, state.invincibilityTimeLeft, state.biome, state.direction, state.isBulletTime, false); this.ctx.restore();
          }
          this.ctx.globalAlpha = 1.0;
        }

        // Motion Streak Detection
        if (state.direction !== prevState.direction) {
          this.emitMotionStreak(state.snake[0], state.direction, prevState.direction, hue);
        }

        this.renderSnakeRibbon(this.ctx, state.snake, prevState.snake, alpha, hue, false, false, state.invincibilityTimeLeft, state.biome, state.direction, state.isBulletTime, state.glitch === GlitchType.PHANTOM);
      }
    }

    if (state.glitch === GlitchType.DARKNESS) {
      this.renderDarknessOverlay(this.ctx, this.canvas, state, alpha, prevState);
    }

    if (state.glitch !== GlitchType.NONE) {
      this.renderGlitchUI(this.ctx, this.canvas, state.glitch, state.glitchTimeLeft / (8 * 15));
    }
    
    // UI & Heatmap bypass Glitch pass for legibility
    if (state.status === GameStatus.GAME_OVER) {
      this.renderHeatmap(this.ctx, this.canvas, state.heatmap);
    }

    if (this.resumeFlashTime > 0) {
      const head = state.snake[0];
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.resumeFlashTime / 10})`;
      const r = Math.max(0.1, this.cellSize * 2);
      this.ctx.beginPath(); 
      this.ctx.arc(head.x * this.cellSize + this.cellSize / 2, head.y * this.cellSize + this.cellSize / 2, r, 0, Math.PI * 2); 
      this.ctx.fill();
      this.resumeFlashTime--;
    }

    if (this.biomeFlashTime > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.biomeFlashTime / 60 * 0.3})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.biomeFlashTime--;
    }

    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.restore();
  }

  private renderScanLine(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const cycle = 240;
    const progress = (this.frameCount % cycle) / cycle;
    const y = progress * canvas.height;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.restore();
  }

  private renderHeatmap(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, heatmap: number[][]): void {
    const cs = canvas.width / this.gridWidth;

    ctx.save();
    // GPU_OPTIMIZATION: Removed ctx.filter (Blur Tax)
    ctx.globalCompositeOperation = 'screen';
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const val = heatmap[y][x];
        if (val === 0) continue;
        ctx.globalAlpha = 0.1; // Simple alpha loop
        const hue = 180 - Math.min(val * 5, 180);
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, 1.0)`;
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    }
    ctx.restore();
  }

  private renderGlitchBit(ctx: CanvasRenderingContext2D, pos: Point): void {
    const cx = pos.x * this.cellSize + this.cellSize / 2;
    const cy = pos.y * this.cellSize + this.cellSize / 2;
    const size = this.cellSize * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.frameCount * 0.1);
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : `hsl(${Math.random() * 360}, 100%, 50%)`;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private renderGlitchUI(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, type: GlitchType, progress: number): void {
    const w = canvas.width * 0.5; const h = 4;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x, y, w * progress, h);
    ctx.font = `${Math.floor(canvas.height / 50)}px "JetBrains Mono"`;
    (ctx as any).letterSpacing = "2px";
    ctx.textAlign = 'center';
    ctx.fillText(`SYSTEM_ERROR: ${type}`, Math.floor(x + w / 2), Math.floor(y - 5));
    (ctx as any).letterSpacing = "0px";
  }

  private renderGhostPath(ctx: CanvasRenderingContext2D, snapshots: Snapshot[]): void {
    ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    snapshots.forEach((snap, i) => {
      if (i % 10 !== 0) return;
      ctx.beginPath(); const s = snap.state.snake; ctx.moveTo(s[0].x * this.cellSize + this.cellSize / 2, s[0].y * this.cellSize + this.cellSize / 2);
      for (let j = 1; j < s.length; j++) ctx.lineTo(s[j].x * this.cellSize + this.cellSize / 2, s[j].y * this.cellSize + this.cellSize / 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  private renderChromaticSnake(ctx: CanvasRenderingContext2D, snake: Point[], prevSnake: Point[], alpha: number, hue: number, shift: number, isCrushed: boolean, isBulletTime: boolean): void {
    ctx.save(); ctx.translate(-shift, 0); this.renderSnakeRibbon(ctx, snake, prevSnake, alpha, 0, true, isCrushed, 0, undefined, undefined, isBulletTime, false); ctx.restore();
    ctx.save(); ctx.translate(shift, 0); this.renderSnakeRibbon(ctx, snake, prevSnake, alpha, 220, true, isCrushed, 0, undefined, undefined, isBulletTime, false); ctx.restore();
    ctx.globalAlpha = 0.5; this.renderSnakeRibbon(ctx, snake, prevSnake, alpha, hue, false, isCrushed, 0, undefined, undefined, isBulletTime, false); ctx.globalAlpha = 1.0;
  }

  private renderRewindEffect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < canvas.height; i += 4) ctx.fillRect(0, i, canvas.width, 2);
    const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 1.2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)'); grad.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private renderBlackHole(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, _state: GameState): void {
    const cx = canvas.width  / 2 - this.offsetX;
    const cy = canvas.height / 2 - this.offsetY;

    // Absolute time — unaffected by Chronos/rewind
    const time  = performance.now() * 0.001;
    const pulse = Math.sin(time * 1.2) * (this.cellSize * 0.25);
    const baseR = this.cellSize * 6;
    const R     = Math.max(5, baseR + pulse); // event horizon radius

    ctx.save();

    // ── 1. Deep Space Glow ─────────────────────────────────────────────────
    const outerGlow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
    outerGlow.addColorStop(0,   'rgba(80, 0, 180, 0.22)');
    outerGlow.addColorStop(0.4, 'rgba(20, 0,  60, 0.12)');
    outerGlow.addColorStop(1,   'rgba(0,  0,   0, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // ── 2. Accretion Disk (flat ellipse swept around the equator) ──────────
    const diskW = R * 2.2;
    const diskH = R * 0.28;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.08);
    const disk = ctx.createLinearGradient(-diskW, 0, diskW, 0);
    disk.addColorStop(0,    'rgba(0,0,0,0)');
    disk.addColorStop(0.22, 'rgba(180, 60, 255, 0.18)');
    disk.addColorStop(0.38, 'rgba(255,140,  0, 0.55)');
    disk.addColorStop(0.5,  'rgba(255,220, 80, 0.70)');
    disk.addColorStop(0.62, 'rgba(255,140,  0, 0.55)');
    disk.addColorStop(0.78, 'rgba(180, 60, 255, 0.18)');
    disk.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.ellipse(0, 0, diskW, diskH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── 3. Event Horizon (absolute black sphere) ───────────────────────────
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // ── 4. Photon Ring / Gravitational Lens Shimmer ────────────────────────
    const lens = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.18);
    lens.addColorStop(0,   'rgba(0,0,0,0)');
    lens.addColorStop(0.4, `rgba(0, 242, 255, ${0.18 + Math.sin(time * 3) * 0.06})`);
    lens.addColorStop(0.7, `rgba(180, 60, 255, ${0.14 + Math.cos(time * 2.3) * 0.05})`);
    lens.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fill();

    // ── 5. Orbital Rings ───────────────────────────────────────────────────
    const rings = [
      { r: R * 1.35, speed: 0.18,  alpha: 0.22, dash: [6, 10], lw: 1.2, color: this.accentColor },
      { r: R * 1.75, speed: -0.09, alpha: 0.14, dash: [3, 16], lw: 0.8, color: '#bf00ff' },
      { r: R * 2.1,  speed: 0.055, alpha: 0.09, dash: [2, 22], lw: 0.6, color: '#ff8800' },
    ];
    for (const ring of rings) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * ring.speed);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth   = ring.lw;
      ctx.globalAlpha = ring.alpha;
      ctx.setLineDash(ring.dash);
      ctx.beginPath();
      ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── 6. Orbiting Star-Debris Particles ─────────────────────────────────
    const maxR = this.cellSize * 9;
    const minR = this.cellSize * 3;
    for (const p of this.voidParticles) {
      // Spiral inward slowly; respawn at outer edge when consumed
      p.radius -= p.speed * 0.35;
      p.angle  += p.speed * (baseR / Math.max(p.radius, 1)) * 0.3;
      if (p.radius < minR * 0.6) {
        p.radius  = minR + Math.random() * (maxR - minR);
        p.angle   = Math.random() * Math.PI * 2;
        p.opacity = 0.3 + Math.random() * 0.7;
      }
      const px = cx + Math.cos(p.angle) * p.radius;
      const py = cy + Math.sin(p.angle) * p.radius * 0.55; // flatten to suggest depth
      // Fade as they approach the event horizon
      const proximity = Math.max(0, (p.radius - minR * 0.6) / (maxR - minR * 0.6));
      ctx.globalAlpha = p.opacity * proximity;
      ctx.fillStyle   = `hsl(${(p.angle * 57 + time * 30) % 360}, 80%, 80%)`;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderMirrorDivider(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const cx = canvas.width / 2; ctx.strokeStyle = 'rgba(255, 165, 0, 0.3)'; ctx.setLineDash([10, 10]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke(); ctx.setLineDash([]);
  }

  private renderBootSequence(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const cx = canvas.width / 2; const cy = canvas.height / 2; const pulse = (Math.sin(this.frameCount * 0.1) + 1) / 2;
    ctx.strokeStyle = `hsla(180, 100%, 50%, ${0.2 + pulse * 0.8})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - 50); ctx.lineTo(cx, cy + 50); ctx.stroke();
  }

  private renderTransitionIn(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, snake: Point[], hue: number): void {
    const p = this.transitionProgress; 
    const cx = canvas.width / 2 - this.offsetX; 
    const cy = canvas.height / 2 - this.offsetY;
    ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${1 - p})`; ctx.lineWidth = 2;
    const r = Math.max(0.1, p * canvas.width);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    snake.forEach((seg, i) => {
      const targetX = seg.x * this.cellSize + this.cellSize / 2; const targetY = seg.y * this.cellSize + this.cellSize / 2;
      const x = (i % 2 === 0 ? -100 : canvas.width + 100) + (targetX - (i % 2 === 0 ? -100 : canvas.width + 100)) * p;
      const y = (i % 3 === 0 ? -100 : canvas.height + 100) + (targetY - (i % 3 === 0 ? -100 : canvas.height + 100)) * p;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`; ctx.fillRect(x - 5, y - 5, 10, 10);
    });
  }

  private renderGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, _status: GameStatus, _biome: BiomeType): void {
    ctx.strokeStyle = '#0a1f21';
    ctx.lineWidth = 1;
    // Draw exactly gridWidth+1 vertical lines (columns)
    for (let i = 0; i <= this.gridWidth; i++) {
      const x = i * this.cellSize;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.gridHeight * this.cellSize); ctx.stroke();
    }
    // Draw exactly gridHeight+1 horizontal lines (rows)
    for (let i = 0; i <= this.gridHeight; i++) {
      const y = i * this.cellSize;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.gridWidth * this.cellSize, y); ctx.stroke();
    }
  }

  private renderOptimizedFood(ctx: CanvasRenderingContext2D, food: Point, isCrushed: boolean): void {
    const cx = food.x * this.cellSize + this.cellSize / 2; 
    const cy = food.y * this.cellSize + this.cellSize / 2;
    
    // ANOMALOUS_FOOD: Pulsing core + scanning brackets
    const scan = Math.sin(this.frameCount * 0.1) * (this.cellSize * 0.1);
    const size = this.cellSize * 0.2;
    
    ctx.save();
    ctx.translate(cx, cy);

    if (isCrushed) {
      ctx.fillStyle = this.accentColor;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    
    // Outer Brackets (Scanning)
    ctx.strokeStyle = this.accentColor;
    ctx.lineWidth = 1;
    const b = this.cellSize * 0.35 + scan;
    const bl = 4; // Bracket arm length

    // TL
    ctx.beginPath(); ctx.moveTo(-b, -b + bl); ctx.lineTo(-b, -b); ctx.lineTo(-b + bl, -b); ctx.stroke();
    // TR
    ctx.beginPath(); ctx.moveTo(b - bl, -b); ctx.lineTo(b, -b); ctx.lineTo(b, -b + bl); ctx.stroke();
    // BL
    ctx.beginPath(); ctx.moveTo(-b, b - bl); ctx.lineTo(-b, b); ctx.lineTo(-b + bl, b); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(b - bl, b); ctx.lineTo(b, b); ctx.lineTo(b, b - bl); ctx.stroke();

    // Pulsing Core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.fillStyle = this.accentColor;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    
    ctx.restore();
  }

  private renderSnakeRibbon(ctx: CanvasRenderingContext2D, snake: Point[], prevSnake: Point[], alpha: number, _hue: number, isGhost: boolean, isCrushed: boolean, invincibilityTimeLeft: number, _biome?: BiomeType, dir?: number, isBulletTime?: boolean, isPhantom?: boolean): void {
    if (snake.length === 0) return;
    const oldGlobalAlpha = ctx.globalAlpha;
    if (invincibilityTimeLeft > 0 && Math.sin(this.frameCount * 0.8) > 0) {
      ctx.globalAlpha = 0.4 * oldGlobalAlpha;
    }
    const points: { x: number, y: number }[] = [];
    snake.forEach((seg, i) => { 
      const prevSeg = prevSnake[i] || seg; 
      points.push({ 
        x: (prevSeg.x + (seg.x - prevSeg.x) * alpha) * this.cellSize + this.cellSize / 2, 
        y: (prevSeg.y + (seg.y - prevSeg.y) * alpha) * this.cellSize + this.cellSize / 2 
      }); 
    });

    const isDistorted = isBulletTime && !isGhost;
    const baseColor = isDistorted ? this.chronosColor : this.accentColor;
    const secondColor = isDistorted ? '#8a00d4' : this.secondaryAccent;

    // PHANTOM Echo (Anaglyph Echoes)
    if (isPhantom && !isCrushed && !isGhost) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      points.forEach((p, i) => {
        if (i === points.length - 1) return;
        const p2 = points[i + 1];
        const dx = p2.x - p.x; const dy = p2.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        ctx.save();
        // Echo offset
        ctx.translate(p.x + Math.sin(this.frameCount * 0.1 + i) * 6, p.y + Math.cos(this.frameCount * 0.1 + i) * 6);
        ctx.rotate(angle);
        ctx.fillStyle = 'rgba(255, 0, 128, 0.4)'; // Magenta echo
        ctx.fillRect(0, -this.cellSize * 0.4, dist, this.cellSize * 0.8);
        ctx.restore();
      });
      ctx.restore();
    }

    // Layered Kinetic Drawing
    points.forEach((p, i) => {
      if (i === points.length - 1) return;
      const p2 = points[i + 1];

      let phantomAlpha = 1.0;
      let jitterX = 0;
      let jitterY = 0;

      if (isPhantom) {
        // Wave phasing: chunks of body phase in and out
        const wave = (Math.sin(i * 0.5 - this.frameCount * 0.15) + 1) / 2;
        phantomAlpha = Math.max(0.1, 1 - (i / (points.length - 1))) * wave;
        
        // Quantum Jitter: physical desynchronization
        if (i > 0 && Math.random() > 0.6) {
          jitterX = (Math.random() - 0.5) * this.cellSize * (i / points.length);
          jitterY = (Math.random() - 0.5) * this.cellSize * (i / points.length);
        }
      }

      ctx.globalAlpha = (invincibilityTimeLeft > 0 && Math.sin(this.frameCount * 0.8) > 0 ? 0.4 : oldGlobalAlpha) * phantomAlpha;
      
      const dx = p2.x - p.x;
      const dy = p2.y - p.y;
      const angle = Math.atan2(dy, dx);
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      ctx.save();
      ctx.translate(p.x + jitterX, p.y + jitterY);
      ctx.rotate(angle);

      if (isCrushed) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, -this.cellSize * 0.4, dist, this.cellSize * 0.8);
      } else {
        // Core: Vertical Gradient with 0.5px gap
        const grad = ctx.createLinearGradient(0, -this.cellSize / 2, 0, this.cellSize / 2);
        grad.addColorStop(0, baseColor);
        grad.addColorStop(1, secondColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0.5, -this.cellSize * 0.4, dist - 0.5, this.cellSize * 0.8);

        // Energy Spine
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5 * phantomAlpha;
        ctx.fillRect(0.5, -0.5, dist - 0.5, 1);
      }
      
      ctx.restore();
    });

    // Head Detail: Sensor Visor
    if (points.length > 0 && !isGhost && !isCrushed) {
      const head = points[0];
      const flicker = isDistorted && Math.random() > 0.8 ? 0 : 1;
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.globalAlpha = flicker;
      
      // Visor orientation
      if (dir === 2 || dir === 3) { // Horizontal movement
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-1, -this.cellSize * 0.3, 2, this.cellSize * 0.6);
      } else { // Vertical movement
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-this.cellSize * 0.3, -1, this.cellSize * 0.6, 2);
      }
      
      ctx.restore();
    }
    ctx.globalAlpha = oldGlobalAlpha;
  }

  public emitEatEffect(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      if (this.particles.length > 20) this.particles.shift();
      this.particles.push({ x: x * this.cellSize + this.cellSize / 2, y: y * this.cellSize + this.cellSize / 2, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 0, maxLife: 30 + Math.random() * 20, size: 2 });
    }
  }

  public emitDeathEffect(x: number, y: number): void {
    for (let i = 0; i < 20; i++) {
      if (this.particles.length > 50) this.particles.shift();
      this.particles.push({ x: x * this.cellSize + this.cellSize / 2, y: y * this.cellSize + this.cellSize / 2, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0, maxLife: 50 + Math.random() * 30, isGlitch: true, size: Math.random() * 4 });
    }
  }

  private emitMotionStreak(head: Point, _dir: number, prevDir: number, hue: number): void {
    const cx = head.x * this.cellSize + this.cellSize / 2;
    const cy = head.y * this.cellSize + this.cellSize / 2;
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: cx, y: cy,
        vx: (prevDir === 3 ? -1 : prevDir === 2 ? 1 : 0) * (5 + Math.random() * 5),
        vy: (prevDir === 1 ? -1 : prevDir === 0 ? 1 : 0) * (5 + Math.random() * 5),
        life: 0, maxLife: 10,
        size: 2,
        color: `hsla(${hue}, 100%, 50%, 0.5)`
      });
    }
  }

  private updateAndRenderParticles(ctx: CanvasRenderingContext2D, hue: number, biome: BiomeType, status: GameStatus): void {
    this.particles = this.particles.filter(p => {
      if (status !== GameStatus.REWINDING) {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life++; 
      }
      ctx.globalAlpha = 1 - p.life / p.maxLife;
      let color = p.color || `hsl(${hue}, 100%, 50%)`; 
      if (p.isGlitch) color = (Math.random() > 0.5 ? '#FF4F4F' : '#ffffff'); 
      else if (biome === BiomeType.ICE && !p.color) color = '#ffffff';
      
      ctx.fillStyle = color; 
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); 
      ctx.globalAlpha = 1.0; 
      return p.life < p.maxLife;
    });
  }

  private renderDarknessOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: GameState, alpha: number, prevState: GameState): void {
    const head = state.snake[0];
    const prevHead = prevState.snake[0];
    if (!head || !prevHead) return;
    const cx = (prevHead.x + (head.x - prevHead.x) * alpha) * this.cellSize + this.cellSize / 2;
    const cy = (prevHead.y + (head.y - prevHead.y) * alpha) * this.cellSize + this.cellSize / 2;
    
    // Failing power flicker
    const flicker = Math.random() > 0.85 ? Math.random() * 0.5 + 0.5 : 1.0;
    const r = this.cellSize * (3 + Math.sin(this.frameCount * 0.4) * 0.5) * flicker;

    ctx.save();
    
    // Lightning Flashes (1 frame every ~3 seconds)
    const isLightning = Math.random() < 0.005;
    if (isLightning) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(-this.offsetX - canvas.width, -this.offsetY - canvas.height, canvas.width * 3, canvas.height * 3);
        ctx.restore();
        return;
    }

    const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5);
    grad.addColorStop(0, 'rgba(5, 5, 8, 0)');
    grad.addColorStop(0.5, 'rgba(5, 5, 8, 0.8)');
    grad.addColorStop(1, 'rgba(5, 5, 8, 0.99)');
    
    ctx.fillStyle = grad;
    ctx.fillRect(-this.offsetX - canvas.width, -this.offsetY - canvas.height, canvas.width * 3, canvas.height * 3);
    
    // Sonar Pings from food
    const foodCX = state.food.x * this.cellSize + this.cellSize / 2;
    const foodCY = state.food.y * this.cellSize + this.cellSize / 2;
    const pingProgress = (this.frameCount % 90) / 90; // 1.5-second interval
    const sonarR = pingProgress * this.cellSize * 12; // expand out
    
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(0, 242, 255, ${(1 - pingProgress) * 0.5})`; // fading cyan
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(foodCX, foodCY, sonarR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

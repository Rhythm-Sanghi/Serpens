import { Direction, GameStatus, BiomeType, GlitchType } from '../Types';
import type { Point, GameState, Snapshot } from '../Types';
import { DefaultBiome, VoidBiome, IceBiome, MirrorBiome, type BiomeStrategy } from './Biome';

export class StateManager {
  private state: GameState;
  private prevState: GameState;
  private snapshots: Snapshot[] = [];
  private readonly maxSnapshots: number = 1000;
  private gridWidth: number;
  private gridHeight: number;
  private initialFps = 15;
  private frameCount = 0;
  private biomesEnabled = true;
  private glitchGraceFrames = 0;
  private lastDeathWasValid = false;
  private biomeWarningTimer = 0;
  private invincibilityTimer = 0;
  private pendingBiome: BiomeType | null = null;

  private biomes: Record<BiomeType, BiomeStrategy> = {
    [BiomeType.DEFAULT]: new DefaultBiome(),
    [BiomeType.VOID]: new VoidBiome(),
    [BiomeType.ICE]: new IceBiome(),
    [BiomeType.MIRROR]: new MirrorBiome(),
  };

  constructor(gridWidth: number, gridHeight: number) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.initialFps = window.innerWidth < 768 ? 6 : 15;
    this.state = this.getInitialState();
    this.prevState = this.copyState(this.state);
  }

  private copyState(src: GameState): GameState {
    return {
      snake: src.snake.map(p => ({...p})),
      rivalSnake: src.rivalSnake ? src.rivalSnake.map(p => ({...p})) : null,
      food: { ...src.food },
      glitchBit: src.glitchBit ? { ...src.glitchBit } : null,
      direction: src.direction,
      rivalDirection: src.rivalDirection,
      score: src.score,
      status: src.status,
      biome: src.biome,
      glitch: src.glitch,
      glitchAge: src.glitchAge,
      glitchTimeLeft: src.glitchTimeLeft,
      stats: { ...src.stats },
      isAutopilot: src.isAutopilot,
      isMultiplayer: src.isMultiplayer,
      isRewindEnabled: src.isRewindEnabled,
      isBulletTime: src.isBulletTime,
      isBiomeWarning: src.isBiomeWarning,
      invincibilityTimeLeft: src.invincibilityTimeLeft,
      tickRate: src.tickRate,
      heatmap: src.heatmap // reference
    };
  }

  private getInitialState(): GameState {
    const heatmap = Array(this.gridHeight).fill(0).map(() => Array(this.gridWidth).fill(0));
    const startX = Math.floor(this.gridWidth / 2) - 2;
    const startY = Math.floor(this.gridHeight / 2);
    const foodX = Math.min(this.gridWidth - 3, Math.floor(this.gridWidth / 2) + 4);
    const foodY = Math.min(this.gridHeight - 3, Math.floor(this.gridHeight / 2));
    return {
      snake: [
        { x: startX, y: startY },
        { x: startX - 1, y: startY },
        { x: startX - 2, y: startY },
      ],
      rivalSnake: null,
      food: { x: foodX, y: foodY },
      glitchBit: null,
      direction: Direction.RIGHT,
      rivalDirection: Direction.LEFT,
      score: 0,
      status: GameStatus.BOOT,
      biome: BiomeType.DEFAULT,
      glitch: GlitchType.NONE,
      glitchAge: 0,
      glitchTimeLeft: 0,
      heatmap: heatmap,
      stats: {
        apexVelocity: this.initialFps,
        totalMeters: 0,
        nearMisses: 0,
      },
      isAutopilot: false,
      isMultiplayer: false,
      isRewindEnabled: true,
      isBulletTime: false,
      isBiomeWarning: false,
      invincibilityTimeLeft: 0,
      tickRate: this.initialFps,
    };
  }

  public update(nextDirection: Direction): void {
    if (this.glitchGraceFrames > 0) this.glitchGraceFrames--;
    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer--;
      this.state.invincibilityTimeLeft = this.invincibilityTimer;
    }

    if (this.state.status === GameStatus.REWINDING) {
      this.rewindTick();
      return;
    }

    if (this.state.status !== GameStatus.PLAYING && this.state.status !== GameStatus.GAME_OVER) return;

    this.frameCount++;
    this.prevState = this.copyState(this.state);

    if (this.biomesEnabled) this.updateBiome();
    this.updateGlitches();

    // Emergency Direction Recovery (Ghost-Busting)
    if (this.state.direction === undefined || this.state.direction === null) {
      this.state.direction = Direction.RIGHT;
      console.warn("[ SYSTEM: INPUT_RECOVERED -> DEFAULTING_RIGHT ]");
    }

    const oldDir = this.state.direction;
    if (this.state.isAutopilot && this.state.food) {
      this.state.direction = this.calculateAutopilotDirection(this.state.snake, this.state.direction);
    } else {
      this.state.direction = nextDirection;
    }

    // Near-Miss Detection
    if (oldDir !== this.state.direction) {
      const ahead = this.moveSnake(this.state.snake, oldDir);
      if (this.checkCollision(ahead, this.state.snake)) {
        this.state.stats.nearMisses++;
      }
    }

    if (this.state.isMultiplayer && this.state.rivalSnake) {
      this.state.rivalDirection = this.calculateAutopilotDirection(this.state.rivalSnake, this.state.rivalDirection);
    }

    const strategy = this.biomes[this.state.biome];
    const dirBeforeBiome = this.state.direction; // snapshot before biome physics
    const { head, dir } = strategy.applyPhysics(this.state.snake[0], this.state.direction, this.state.direction, this.gridWidth, this.gridHeight, this.frameCount);
    this.state.direction = dir;

    // 1. Grid Bounds Protection
    // If the Void biome's gravity changed the direction and pushed us out,
    // treat it as a grace bounce rather than an instant kill.
    const biomeChangedDir = (dir !== dirBeforeBiome);
    if (head.x < 0 || head.x >= this.gridWidth || head.y < 0 || head.y >= this.gridHeight) {
      if (this.glitchGraceFrames > 0 || biomeChangedDir) {
        head.x = Math.max(0, Math.min(this.gridWidth - 1, head.x));
        head.y = Math.max(0, Math.min(this.gridHeight - 1, head.y));
      } else {
        console.log(`[SYSTEM_LOG]: Death by WALL at (${head.x},${head.y})`);
        this.lastDeathWasValid = true;
        this.state.status = GameStatus.GAME_OVER;
        return;
      }
    }

    // 2. Void Event Horizon Collision
    // Only kill when very close to the absolute center AND not invincible.
    // dist < 0.5 means the snake is essentially ON the singularity.
    if (this.state.biome === BiomeType.VOID && this.invincibilityTimer <= 0) {
      const centerX = this.gridWidth / 2;
      const centerY = this.gridHeight / 2;
      const dx = centerX - head.x;
      const dy = centerY - head.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) {
        if (this.glitchGraceFrames <= 0) {
          console.log(`[SYSTEM_LOG]: Death by VOID_EVENT_HORIZON at (${head.x},${head.y})`);
          this.lastDeathWasValid = true;
          this.state.status = GameStatus.GAME_OVER;
          return;
        }
      }
    }

    // 2. Heatmap Update (Safe after bounds check)
    this.state.heatmap[head.y][head.x]++;
    this.state.stats.totalMeters++;
    this.state.stats.apexVelocity = Math.max(this.state.stats.apexVelocity, this.state.tickRate);

    if (this.checkCollision(head, this.state.snake)) {
      if (this.glitchGraceFrames <= 0) {
        console.log(`[SYSTEM_LOG]: Death by SELF_COLLISION at (${head.x},${head.y})`);
        this.lastDeathWasValid = true;
        this.state.status = GameStatus.GAME_OVER;
        return;
      }
    }
    
    if (this.state.rivalSnake && this.checkCollision(head, this.state.rivalSnake)) {
      if (this.glitchGraceFrames <= 0) {
        console.log(`[SYSTEM_LOG]: Death by RIVAL_COLLISION at (${head.x},${head.y})`);
        this.lastDeathWasValid = true;
        this.state.status = GameStatus.GAME_OVER;
        return;
      }
    }
    this.state.snake.unshift(head);

    // Mirror logic
    let mirrorHead: Point | null = null;
    if (this.state.biome === BiomeType.MIRROR) {
      mirrorHead = { x: this.gridWidth - 1 - head.x, y: head.y };
      if (this.checkCollision(mirrorHead, this.state.snake)) { this.state.status = GameStatus.GAME_OVER; return; }
    }

    // Glitch Bit Spawning
    if (!this.state.glitchBit && Math.random() < 0.01) {
      this.spawnGlitchBit();
    }

    // Pick up Glitch Bit
    if (this.state.glitchBit && head.x === this.state.glitchBit.x && head.y === this.state.glitchBit.y) {
      this.triggerGlitch();
      this.state.glitchBit = null;
    }

    // Move Rival
    if (this.state.isMultiplayer && this.state.rivalSnake) {
      const rivalHead = this.moveSnake(this.state.rivalSnake, this.state.rivalDirection);
      if (this.checkCollision(rivalHead, this.state.rivalSnake) || this.checkCollision(rivalHead, this.state.snake)) {
        this.resetRival();
      } else {
        this.state.rivalSnake.unshift(rivalHead);
        if (rivalHead.x === this.state.food.x && rivalHead.y === this.state.food.y) {
          this.spawnFood(); this.state.rivalSnake.pop();
        } else { this.state.rivalSnake.pop(); }
      }
    }

    // Food
    if (head.x === this.state.food.x && head.y === this.state.food.y || (mirrorHead && mirrorHead.x === this.state.food.x && mirrorHead.y === this.state.food.y)) {
      this.state.score += 10;
      this.spawnFood();
      this.updateDifficulty();
    } else {
      this.state.snake.pop();
    }

    if (this.state.isRewindEnabled) {
      this.saveSnapshot();
    }
  }

  private updateGlitches(): void {
    if (this.state.glitch !== GlitchType.NONE) {
      this.state.glitchAge++;
      this.state.glitchTimeLeft--;
      if (this.state.glitch === GlitchType.WARP) {
        // Randomly fluctuate speed
        this.state.tickRate = 15 + Math.sin(this.frameCount * 0.5) * 10;
      }
      if (this.state.glitchTimeLeft <= 0) {
        this.state.glitch = GlitchType.NONE;
        this.state.glitchAge = 0;
        if (this.state.status === GameStatus.PLAYING) this.updateDifficulty();
      }
    } else {
      this.state.glitchAge = 0;
    }
  }

  private spawnGlitchBit(): void {
    this.state.glitchBit = {
      x: Math.floor(Math.random() * this.gridWidth),
      y: Math.floor(Math.random() * this.gridHeight),
    };
  }

  private triggerGlitch(): void {
    const types = [GlitchType.WARP, GlitchType.INVERT, GlitchType.CRUSH, GlitchType.DARKNESS, GlitchType.PHANTOM];
    this.state.glitch = types[Math.floor(Math.random() * types.length)];
    this.state.glitchTimeLeft = 8 * this.initialFps; // ~8 seconds
    this.glitchGraceFrames = 2; // Shield during transition
  }

  private updateBiome(): void {
    if (this.state.isBiomeWarning) {
      this.biomeWarningTimer--;
      if (this.biomeWarningTimer <= 0) {
        this.state.isBiomeWarning = false;
        this.state.biome = this.pendingBiome!;
        this.invincibilityTimer = 45; // 3 seconds of grace when void activates
        window.dispatchEvent(new CustomEvent('biome-shift', { detail: this.state.biome }));
      }
      return;
    }

    const score = this.state.score;
    let newBiome: BiomeType = BiomeType.DEFAULT;
    if (score >= 150) newBiome = BiomeType.MIRROR;
    else if (score >= 100) newBiome = BiomeType.ICE;
    else if (score >= 50) newBiome = BiomeType.VOID;

    if (newBiome !== this.state.biome) {
      if (newBiome === BiomeType.VOID) {
        this.state.isBiomeWarning = true;
        this.biomeWarningTimer = 90; // 6 seconds warning — enough to react
        this.pendingBiome = newBiome;
        window.dispatchEvent(new CustomEvent('biome-warning', { detail: newBiome }));
      } else {
        this.state.biome = newBiome;
        this.invincibilityTimer = 45; // 3 seconds protection on other biome shifts
        window.dispatchEvent(new CustomEvent('biome-shift', { detail: newBiome }));
      }
    }
  }

  private moveSnake(snake: Point[], dir: Direction): Point {
    const head = { ...snake[0] };
    switch (dir) {
      case Direction.UP: head.y--; break; case Direction.DOWN: head.y++; break;
      case Direction.LEFT: head.x--; break; case Direction.RIGHT: head.x++; break;
    }
    return head;
  }

  private updateDifficulty(): void {
    if (this.state.glitch === GlitchType.WARP) return;
    const level = Math.floor(this.state.score / 50);
    const speedRamp = window.innerWidth < 768 ? level : level * 2;
    this.state.tickRate = Math.min(this.initialFps + speedRamp, 40);
  }

  private resetRival(): void {
    this.state.rivalSnake = [{ x: this.gridWidth - 11, y: this.gridHeight - 11 }, { x: this.gridWidth - 10, y: this.gridHeight - 11 }, { x: this.gridWidth - 9, y: this.gridHeight - 11 }];
    this.state.rivalDirection = Direction.LEFT;
  }

  private checkCollision(p: Point, snake: Point[]): boolean {
    if (p.x < 0 || p.x >= this.gridWidth || p.y < 0 || p.y >= this.gridHeight) return true;
    return snake.some((seg) => seg.x === p.x && seg.y === p.y);
  }

  private spawnFood(): void {
    let newFood: Point;
    const allSegments = [...this.state.snake, ...(this.state.rivalSnake || [])];
    const isVoid = this.state.biome === BiomeType.VOID;
    const voidCX = this.gridWidth  / 2;
    const voidCY = this.gridHeight / 2;
    // Keep food outside the void event horizon (radius 6 cells) so it's reachable
    const VOID_CLEAR_RADIUS = 7;
    do {
      newFood = { x: Math.floor(Math.random() * this.gridWidth), y: Math.floor(Math.random() * this.gridHeight) };
    } while (
      allSegments.some(s => s.x === newFood.x && s.y === newFood.y) || 
      (isVoid && Math.sqrt((voidCX - newFood.x) ** 2 + (voidCY - newFood.y) ** 2) < VOID_CLEAR_RADIUS) || 
      (window.innerWidth < 768 && newFood.x >= this.gridWidth - 9 && newFood.y >= this.gridHeight - 6)
    );
    this.state.food = newFood;
  }

  private saveSnapshot(): void {
    this.snapshots.push({ timestamp: Date.now(), state: this.copyState(this.state) });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  public rewindTick(isEmergency: boolean = false): void {
    const ticks = isEmergency ? 15 : 1; // 1 second approx at 15fps
    for (let i = 0; i < ticks; i++) {
      if (this.snapshots.length > 0) {
        const last = this.snapshots.pop();
        if (last) { 
          this.state = last.state; 
          this.state.status = isEmergency ? GameStatus.PLAYING : GameStatus.REWINDING; 
          this.prevState = this.copyState(this.state); 
        }
      } else { 
        this.state.status = isEmergency ? GameStatus.PLAYING : GameStatus.GAME_OVER; 
        break;
      }
    }
  }

  public wasLastDeathValid(): boolean { return this.lastDeathWasValid; }
  public setStatus(status: GameStatus): void { this.state.status = status; }
  public getState(): GameState { return this.state; }
  public getPrevState(): GameState { return this.prevState; }
  public getSnapshots(): Snapshot[] { return this.snapshots; }
  public setAutopilot(active: boolean): void { this.state.isAutopilot = active; }
  public setMultiplayer(active: boolean): void { this.state.isMultiplayer = active; if (active && !this.state.rivalSnake) this.resetRival(); else if (!active) this.state.rivalSnake = null; }
  public setRewindEnabled(active: boolean): void { this.state.isRewindEnabled = active; if (!active) this.snapshots = []; }
  public setBiomesEnabled(active: boolean): void { this.biomesEnabled = active; }

  public reset(): void {
    const status = this.state.status; const multi = this.state.isMultiplayer; const biomes = this.biomesEnabled;
    this.state = this.getInitialState(); this.state.status = status; this.setMultiplayer(multi); this.setBiomesEnabled(biomes);
    this.spawnFood();
    this.prevState = this.copyState(this.state); this.snapshots = [];
  }

  private calculateAutopilotDirection(snake: Point[], currentDir: Direction): Direction {
    const head = snake[0]; const food = this.state.food;
    const path = this.findPath(head, food, snake);
    if (path && path.length > 1) {
      const nextStep = path[1];
      if (nextStep.x > head.x) return Direction.RIGHT; if (nextStep.x < head.x) return Direction.LEFT;
      if (nextStep.y > head.y) return Direction.DOWN; if (nextStep.y < head.y) return Direction.UP;
    }
    const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
    let bestDir = currentDir; let maxNeighbors = -1;
    for (const dir of dirs) {
      const next = { ...head }; if (dir === Direction.UP) next.y--; if (dir === Direction.DOWN) next.y++; if (dir === Direction.LEFT) next.x--; if (dir === Direction.RIGHT) next.x++;
      if (!this.checkCollision(next, snake)) {
        let freeNeighbors = 0;
        [{ x: next.x + 1, y: next.y }, { x: next.x - 1, y: next.y }, { x: next.x, y: next.y + 1 }, { x: next.x, y: next.y - 1 }].forEach(n => {
          if (n.x >= 0 && n.x < this.gridWidth && n.y >= 0 && n.y < this.gridHeight && !snake.some(s => s.x === n.x && s.y === n.y)) freeNeighbors++;
        });
        if (freeNeighbors > maxNeighbors) { maxNeighbors = freeNeighbors; bestDir = dir; }
      }
    }
    return bestDir;
  }

  private findPath(start: Point, target: Point, snake: Point[]): Point[] | null {
    const openSet: Point[] = [start]; const cameFrom = new Map<string, Point>(); const gScore = new Map<string, number>(); const fScore = new Map<string, number>();
    const key = (p: Point) => `${p.x},${p.y}`;
    gScore.set(key(start), 0); fScore.set(key(start), this.dist(start, target));
    while (openSet.length > 0) {
      openSet.sort((a, b) => (fScore.get(key(a)) || Infinity) - (fScore.get(key(b)) || Infinity));
      const current = openSet.shift()!;
      if (current.x === target.x && current.y === target.y) {
        const path = [current]; let curr = current; while (cameFrom.has(key(curr))) { curr = cameFrom.get(key(curr))!; path.unshift(curr); }
        return path;
      }
      [{ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }].forEach(neighbor => {
        if (neighbor.x < 0 || neighbor.x >= this.gridWidth || neighbor.y < 0 || neighbor.y >= this.gridHeight) return;
        if (snake.some(s => s.x === neighbor.x && s.y === neighbor.y)) return;
        const tentativeGScore = (gScore.get(key(current)) || 0) + 1;
        if (tentativeGScore < (gScore.get(key(neighbor)) || Infinity)) {
          cameFrom.set(key(neighbor), current); gScore.set(key(neighbor), tentativeGScore); fScore.set(key(neighbor), tentativeGScore + this.dist(neighbor, target));
          if (!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) openSet.push(neighbor);
        }
      });
    }
    return null;
  }
  private dist(a: Point, b: Point): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  public resize(width: number, height: number): void {
    this.gridWidth = width;
    this.gridHeight = height;
    this.initialFps = window.innerWidth < 768 ? 6 : 15;
    if (this.state && (this.state.status === GameStatus.BOOT || this.state.status === GameStatus.MENU)) {
      this.state.tickRate = this.initialFps;
    }
    while (this.state.heatmap.length < height) {
      this.state.heatmap.push(Array(width).fill(0));
    }
  }
}

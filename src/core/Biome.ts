import { type Point, Direction } from '../Types';

export interface BiomeStrategy {
  applyPhysics(head: Point, currentDir: Direction, nextDir: Direction, gridWidth: number, gridHeight: number, frame: number): { head: Point, dir: Direction };
  reset?(): void;
}

export class DefaultBiome implements BiomeStrategy {
  applyPhysics(head: Point, _currentDir: Direction, nextDir: Direction, _gridWidth: number, _gridHeight: number, _frame: number): { head: Point, dir: Direction } {
    const newHead = { ...head };
    switch (nextDir) {
      case Direction.UP: newHead.y--; break;
      case Direction.DOWN: newHead.y++; break;
      case Direction.LEFT: newHead.x--; break;
      case Direction.RIGHT: newHead.x++; break;
    }
    return { head: newHead, dir: nextDir };
  }
}

export class VoidBiome implements BiomeStrategy {
  applyPhysics(head: Point, _currentDir: Direction, nextDir: Direction, gridWidth: number, gridHeight: number, _frame: number): { head: Point, dir: Direction } {
    const centerX = gridWidth / 2;
    const centerY = gridHeight / 2;
    const dx = centerX - head.x;
    const dy = centerY - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let finalDir = nextDir;
    
    // Scale pull radius dynamically based on grid size for flawless mobile gameplay
    const pullRadius = gridWidth < 16 ? 6 : 12;

    if (dist <= pullRadius) {
      // G constant tuned for 15fps logic
      const G = 4.0;
      const safeDist = Math.max(0.1, dist);
      const pullProbability = Math.min(G / (safeDist * safeDist), 1.0);
      
      if (Math.random() < pullProbability) {
        if (Math.abs(dx) > Math.abs(dy)) finalDir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
        else finalDir = dy > 0 ? Direction.DOWN : Direction.UP;
      }
    }

    const newHead = { ...head };
    switch (finalDir) {
      case Direction.UP: newHead.y--; break;
      case Direction.DOWN: newHead.y++; break;
      case Direction.LEFT: newHead.x--; break;
      case Direction.RIGHT: newHead.x++; break;
    }
    return { head: newHead, dir: finalDir };
  }
}

export class IceBiome implements BiomeStrategy {
  private slideCounter = 0;
  private pendingDir: Direction | null = null;
  private readonly SLIDE_DURATION = 3; // 3 full tiles of exhilarating sliding

  public reset(): void {
    this.slideCounter = 0;
    this.pendingDir = null;
  }

  applyPhysics(head: Point, currentDir: Direction, nextDir: Direction, gridWidth: number, gridHeight: number, _frame: number): { head: Point, dir: Direction } {
    let finalDir = nextDir;
    
    if (this.slideCounter > 0 && this.pendingDir !== null) {
      this.slideCounter--;
      let nextStepHit = false;
      const testHead = { ...head };
      switch (currentDir) {
        case Direction.UP: testHead.y--; break; case Direction.DOWN: testHead.y++; break;
        case Direction.LEFT: testHead.x--; break; case Direction.RIGHT: testHead.x++; break;
      }
      if (testHead.x < 0 || testHead.x >= gridWidth || testHead.y < 0 || testHead.y >= gridHeight) {
        nextStepHit = true;
      }
      
      if (this.slideCounter === 0 || nextStepHit) {
        finalDir = this.pendingDir;
        this.slideCounter = 0;
        this.pendingDir = null;
      } else {
        finalDir = currentDir;
        window.dispatchEvent(new CustomEvent('ice-skid', { detail: { x: head.x, y: head.y } }));
      }
    } else if (nextDir !== currentDir && this.slideCounter === 0) {
      // Start of skid!
      this.slideCounter = this.SLIDE_DURATION;
      this.pendingDir = nextDir;
      finalDir = currentDir;
      window.dispatchEvent(new CustomEvent('ice-skid', { detail: { x: head.x, y: head.y } }));
    } else {
      this.slideCounter = 0;
      this.pendingDir = null;
    }

    const newHead = { ...head };
    switch (finalDir) {
      case Direction.UP: newHead.y--; break;
      case Direction.DOWN: newHead.y++; break;
      case Direction.LEFT: newHead.x--; break;
      case Direction.RIGHT: newHead.x++; break;
    }
    return { head: newHead, dir: finalDir };
  }
}

export class MirrorBiome implements BiomeStrategy {
  applyPhysics(head: Point, _currentDir: Direction, nextDir: Direction, _gridWidth: number, _gridHeight: number, _frame: number): { head: Point, dir: Direction } {
    const newHead = { ...head };
    switch (nextDir) {
      case Direction.UP: newHead.y--; break;
      case Direction.DOWN: newHead.y++; break;
      case Direction.LEFT: newHead.x--; break;
      case Direction.RIGHT: newHead.x++; break;
    }
    return { head: newHead, dir: nextDir };
  }
}

import { type Point, Direction } from '../Types';

export interface BiomeStrategy {
  applyPhysics(head: Point, currentDir: Direction, nextDir: Direction, gridSize: number, frame: number): { head: Point, dir: Direction };
}

export class DefaultBiome implements BiomeStrategy {
  applyPhysics(head: Point, _currentDir: Direction, nextDir: Direction, _gridSize: number, _frame: number): { head: Point, dir: Direction } {
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
  applyPhysics(head: Point, _currentDir: Direction, nextDir: Direction, gridSize: number, _frame: number): { head: Point, dir: Direction } {
    const center = gridSize / 2;
    const dx = center - head.x;
    const dy = center - head.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    let finalDir = nextDir;
    
    // Inverse Square Law: Force = G / Distance^2
    // Inner Core (0-2): Strong pull
    // Outer Ring (2-8): Subtle nudge
    // Beyond 8: Zero force
    if (dist <= 8) {
      // G constant tuned for 15fps logic
      const G = 2.5; 
      const pullProbability = Math.min(G / (dist * dist), 1.0);
      
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
  private driftActive = false;

  applyPhysics(head: Point, currentDir: Direction, nextDir: Direction, _gridSize: number, _frame: number): { head: Point, dir: Direction } {
    let finalDir = nextDir;
    
    // Inertia: If direction changed, slide one extra tile in currentDir first
    if (nextDir !== currentDir && !this.driftActive) {
      this.driftActive = true;
      finalDir = currentDir;
    } else {
      this.driftActive = false;
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
  applyPhysics(head: Point, _currentDir: Direction, nextDir: Direction, _gridSize: number, _frame: number): { head: Point, dir: Direction } {
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

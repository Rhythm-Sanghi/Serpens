import { Direction, GameStatus } from '../Types';

export class InputHandler {
  private directionQueue: Direction[] = [];
  private currentDirection: Direction = Direction.RIGHT;
  private touchStart: { x: number; y: number } | null = null;
  private readonly minSwipeDistance = 30;
  private onKeyPressCallback: ((key: string) => void) | null = null;
  private onTakeoverCallback: (() => void) | null = null;
  private onRestartCallback: (() => void) | null = null;
  private onRewindStartCallback: (() => void) | null = null;
  private onRewindEndCallback: (() => void) | null = null;
  
  private statusProvider: (() => GameStatus) | null = null;
  private keysPressed: Set<string> = new Set();

  constructor() {
    window.addEventListener('keydown', (e) => this.handleKeydown(e), { capture: true });
    window.addEventListener('keyup', (e) => this.handleKeyup(e), { capture: true });
    window.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
  }

  public setStatusProvider(provider: () => GameStatus) { this.statusProvider = provider; }
  public setOnKeyPress(cb: (key: string) => void) { this.onKeyPressCallback = cb; }
  public setOnTakeover(cb: () => void) { this.onTakeoverCallback = cb; }
  public setOnRestart(cb: () => void) { this.onRestartCallback = cb; }
  public setOnRewindStart(cb: () => void) { this.onRewindStartCallback = cb; }
  public setOnRewindEnd(cb: () => void) { this.onRewindEndCallback = cb; }

  public isKeyPressed(key: string): boolean {
    return this.keysPressed.has(key.toLowerCase());
  }

  private handleKeydown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const status = this.statusProvider ? this.statusProvider() : null;
    
    this.keysPressed.add(key);

    // Global Prevent Default for functional keys
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'r'].includes(key)) {
      e.preventDefault();
    }

    // 1. Handle State Transitions first (Global Priority)
    if (status === GameStatus.GAME_OVER) {
      if (key === ' ') {
        requestAnimationFrame(() => {
          if (this.onRestartCallback) this.onRestartCallback();
        });
        return;
      }
    }

    if (key === 'r') {
       requestAnimationFrame(() => {
         if (this.onRewindStartCallback) this.onRewindStartCallback();
       });
       return;
    }

    // 2. Handle Directional Input
    let newDir: Direction | null = null;
    if (['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd'].includes(key)) {
      if (['arrowup', 'w'].includes(key)) newDir = Direction.UP;
      if (['arrowdown', 's'].includes(key)) newDir = Direction.DOWN;
      if (['arrowleft', 'a'].includes(key)) newDir = Direction.LEFT;
      if (['arrowright', 'd'].includes(key)) newDir = Direction.RIGHT;

      if (newDir !== null) {
        if (this.directionQueue.length < 2) {
          this.directionQueue.push(newDir);
        }
        requestAnimationFrame(() => {
          if (this.onTakeoverCallback) this.onTakeoverCallback();
          if (this.onKeyPressCallback) this.onKeyPressCallback(e.key);
        });
      }
    }
  }

  private handleKeyup(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    this.keysPressed.delete(key);
    
    if (key === 'r') {
      requestAnimationFrame(() => {
        if (this.onRewindEndCallback) this.onRewindEndCallback();
      });
    }
  }

  private handleTouchStart(e: TouchEvent) {
    this.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.touchStart) return;
    const touchEnd = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const dx = touchEnd.x - this.touchStart.x;
    const dy = touchEnd.y - this.touchStart.y;

    if (Math.abs(dx) > this.minSwipeDistance || Math.abs(dy) > this.minSwipeDistance) {
      e.preventDefault();
      let newDir: Direction | null = null;
      if (Math.abs(dx) > Math.abs(dy)) {
        newDir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
      } else {
        newDir = dy > 0 ? Direction.DOWN : Direction.UP;
      }

      if (newDir !== null && this.directionQueue.length < 2) {
        this.directionQueue.push(newDir);
        if (this.onTakeoverCallback) this.onTakeoverCallback();
      }
      this.touchStart = null;
    }
  }

  public getNextDirection(): Direction {
    if (this.directionQueue.length === 0) return this.currentDirection;
    const next = this.directionQueue.shift()!;
    const isOpposite = 
      (next === Direction.UP && this.currentDirection === Direction.DOWN) ||
      (next === Direction.DOWN && this.currentDirection === Direction.UP) ||
      (next === Direction.LEFT && this.currentDirection === Direction.RIGHT) ||
      (next === Direction.RIGHT && this.currentDirection === Direction.LEFT);

    if (!isOpposite) this.currentDirection = next;
    return this.currentDirection;
  }

  public reset(dir: Direction) {
    this.currentDirection = dir;
    this.directionQueue = [];
    this.keysPressed.clear();
  }
}

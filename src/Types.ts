export const Direction = {
  UP: 0,
  DOWN: 1,
  LEFT: 2,
  RIGHT: 3
} as const;
export type Direction = typeof Direction[keyof typeof Direction];

export const GameStatus = {
  BOOT: 'BOOT',
  MENU: 'MENU',
  TRANSITION_IN: 'TRANSITION_IN',
  PLAYING: 'PLAYING',
  REWINDING: 'REWINDING',
  GAME_OVER: 'GAME_OVER'
} as const;
export type GameStatus = typeof GameStatus[keyof typeof GameStatus];

export const BiomeType = {
  DEFAULT: 'DEFAULT',
  VOID: 'VOID',
  ICE: 'ICE',
  MIRROR: 'MIRROR'
} as const;
export type BiomeType = typeof BiomeType[keyof typeof BiomeType];

export const GlitchType = {
  NONE: 'NONE',
  INVERT: 'INVERT_REALITY',
  CRUSH: 'PIXEL_CRUSH',
  WARP: 'CHRONOS_WARP'
} as const;
export type GlitchType = typeof GlitchType[keyof typeof GlitchType];

export interface Point {
  x: number;
  y: number;
}

export interface GameState {
  snake: Point[];
  rivalSnake: Point[] | null;
  food: Point;
  glitchBit: Point | null;
  direction: Direction;
  rivalDirection: Direction;
  score: number;
  status: GameStatus;
  biome: BiomeType;
  glitch: GlitchType;
  glitchAge: number;
  glitchTimeLeft: number;
  heatmap: number[][];
  stats: {
    apexVelocity: number;
    totalMeters: number;
    nearMisses: number;
  };
  isAutopilot: boolean;
  isMultiplayer: boolean;
  isRewindEnabled: boolean;
  isBulletTime: boolean;
  isBiomeWarning: boolean;
  invincibilityTimeLeft: number;
  tickRate: number;
}

export interface EngineConfig {
  gridSize: number;
  logicFps: number;
  renderFps: number;
}

export interface GameConfig {
  autopilotEnabled: boolean;
  multiplayerEnabled: boolean;
  hapticsEnabled: boolean;
  rewindEnabled: boolean;
  biomesEnabled: boolean;
  audioEnabled: boolean;
}

export interface Snapshot {
  timestamp: number;
  state: GameState;
}

export interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  isGlitch?: boolean;
  size: number;
}

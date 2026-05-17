import './style.css';
import { Engine } from './core/Engine';
import { StateManager } from './core/State';
import { Renderer } from './core/Renderer';
import { InputHandler } from './core/Input';
import { AudioSystem } from './core/Audio';
import { GameStatus, Direction, GlitchType } from './Types';
import type { GameConfig } from './Types';

// Local Fonts
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

// Capacitor Plugins
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor } from '@capacitor/core';

console.groupCollapsed('SERPENS_SYSTEM_START');

// Elements
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const scoreEl = document.querySelector<HTMLDivElement>('#score')!;
const appEl = document.querySelector<HTMLDivElement>('#app')!;
const menuOverlay = document.querySelector<HTMLDivElement>('#menu-overlay')!;
const menuLanding = document.querySelector<HTMLDivElement>('#menu-landing')!;
const menuConfig = document.querySelector<HTMLDivElement>('#menu-config')!;
const launchSequence = document.querySelector<HTMLDivElement>('#launch-sequence')!;
const loadingProgress = document.querySelector<HTMLDivElement>('#loading-progress')!;
const loadingText = document.querySelector<HTMLDivElement>('#loading-text')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const configBtn = document.querySelector<HTMLButtonElement>('#config-btn')!;
const backToMenuBtn = document.querySelector<HTMLButtonElement>('#back-to-menu')!;
const toastContainer = document.querySelector<HTMLDivElement>('#toast-container')!;

// Toggles
const toggleAutopilot = document.querySelector<HTMLInputElement>('#toggle-autopilot')!;
const toggleBiomes = document.querySelector<HTMLInputElement>('#toggle-biomes')!;
const toggleRewind = document.querySelector<HTMLInputElement>('#toggle-rewind')!;
const toggleHaptics = document.querySelector<HTMLInputElement>('#toggle-haptics')!;
const toggleMultiplayer = document.querySelector<HTMLInputElement>('#toggle-multiplayer')!;
const toggleAudio = document.querySelector<HTMLInputElement>('#toggle-audio')!;

const multiIndicator = document.querySelector<HTMLDivElement>('#multiplayer-indicator')!;
const aiIndicator = document.querySelector<HTMLDivElement>('#ai-indicator')!;

const LOGIC_FPS = 15;

const GAME_CONFIG: GameConfig = {
  autopilotEnabled: false,
  multiplayerEnabled: false,
  hapticsEnabled: true,
  rewindEnabled: true,
  biomesEnabled: true,
  audioEnabled: true,
};

const GRID_WIDTH = 40;
let initialCellSize = window.innerWidth / GRID_WIDTH;
let GRID_HEIGHT = Math.floor(window.innerHeight / initialCellSize);

const state = new StateManager(GRID_WIDTH, GRID_HEIGHT);
const input = new InputHandler();
const audio = new AudioSystem();

input.setStatusProvider(() => state.getState().status);

let isFreezing = false;
let isBooting = false;
let gameOverOverlay: HTMLDivElement | null = null;

// Register resize listeners BEFORE new Renderer() — the Renderer constructor
// calls this.resize() synchronously, which fires these events immediately.
// If listeners aren't registered yet, state keeps GRID_WIDTH=40 while the
// renderer uses the clamped width, making food spawn off-screen on mobile.
window.addEventListener('resize-cell', (e: any) => {
  input.setCellSize(e.detail);
});

window.addEventListener('resize-grid', (e: any) => {
  state.resize(e.detail.w, e.detail.h);
});

const renderer = new Renderer(canvas, GRID_WIDTH, GRID_HEIGHT);

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Native Bridge Initialization
const initNative = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await ScreenOrientation.lock({ orientation: 'portrait' });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.hide();
    } catch (e) {
      console.warn("Native: Plugin initialization failed", e);
    }
  }
};
initNative();

// Safety-Checked Vibration Bridge
async function triggerHaptic(type: 'turn' | 'eat' | 'death' | 'warning') {
  if (!GAME_CONFIG.hapticsEnabled) return;

  if (Capacitor.isNativePlatform()) {
    try {
      switch (type) {
        case 'turn':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'eat':
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'death':
          await Haptics.vibrate({ duration: 50 });
          setTimeout(() => Haptics.vibrate({ duration: 50 }), 100);
          break;
        case 'warning':
          await Haptics.vibrate({ duration: 100 });
          setTimeout(() => Haptics.vibrate({ duration: 100 }), 200);
          break;
      }
    } catch (e) {
      console.warn("Haptics: Native call failed.");
    }
  } else if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      switch (type) {
        case 'turn': navigator.vibrate(10); break;
        case 'eat': navigator.vibrate(20); break;
        case 'death': navigator.vibrate([50, 30, 50]); break;
        case 'warning': navigator.vibrate([100, 50, 100]); break;
      }
    } catch (e) {
      console.warn("Haptics: Browser vibration failed.");
    }
  }
}

// Hardware Back Button
if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    const s = state.getState();
    if (s.status === GameStatus.PLAYING) {
      // If in game, open config
      menuLanding.classList.add('hidden');
      menuConfig.classList.remove('hidden');
      menuOverlay.classList.remove('hidden');
      menuOverlay.style.opacity = '1';
      menuOverlay.style.transform = 'scale(1) translateY(0)';
      document.body.classList.add('menu-active');
      engine.setPaused(true);
    } else if (s.status === GameStatus.MENU || s.status === GameStatus.BOOT) {
      App.exitApp();
    } else {
      // Go back to main menu
      menuConfig.classList.add('hidden');
      menuLanding.classList.remove('hidden');
    }
  });
}

// Menu Logic
configBtn.addEventListener('click', () => {
  menuLanding.classList.add('hidden');
  menuConfig.classList.remove('hidden');
});

backToMenuBtn.addEventListener('click', () => {
  menuConfig.classList.add('hidden');
  menuLanding.classList.remove('hidden');
});

// Launch Sequence
startBtn.addEventListener('click', async () => {
  if (isBooting) return;
  isBooting = true;
  window.focus();
  canvas.focus();
  await audio.resume();

  // Sync Config
  GAME_CONFIG.autopilotEnabled = toggleAutopilot.checked;
  GAME_CONFIG.biomesEnabled = toggleBiomes.checked;
  GAME_CONFIG.rewindEnabled = toggleRewind.checked;
  GAME_CONFIG.hapticsEnabled = toggleHaptics.checked;
  GAME_CONFIG.multiplayerEnabled = toggleMultiplayer.checked;
  GAME_CONFIG.audioEnabled = toggleAudio.checked;

  state.setAutopilot(GAME_CONFIG.autopilotEnabled);
  state.setBiomesEnabled(GAME_CONFIG.biomesEnabled);
  state.setRewindEnabled(GAME_CONFIG.rewindEnabled);
  state.setMultiplayer(GAME_CONFIG.multiplayerEnabled);

  if (GAME_CONFIG.autopilotEnabled) aiIndicator.classList.remove('hidden'); else aiIndicator.classList.add('hidden');
  if (GAME_CONFIG.multiplayerEnabled) multiIndicator.classList.remove('hidden'); else multiIndicator.classList.add('hidden');

  // Collapse UI
  menuOverlay.style.opacity = '0';
  menuOverlay.style.transform = 'scale(0.9) translateY(20px)';
  document.body.classList.remove('menu-active');
  
  await new Promise(resolve => setTimeout(resolve, 300));
  menuOverlay.classList.add('hidden');
  
  // Show Loading
  launchSequence.classList.remove('hidden');
  const statuses = ['CALIBRATING_BIOMES...', 'STABILIZING_GRID...', 'INITIATING_NEURAL_LINK...', 'LOADING_ARENA_GFX...'];
  
  for (let i = 0; i <= 100; i += Math.random() * 15) {
    const progress = Math.min(i, 100);
    loadingProgress.style.width = `${progress}%`;
    loadingText.innerText = statuses[Math.floor(progress / 26)];
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  }
  
  launchSequence.classList.add('hidden');
  state.reset();
  state.setStatus(GameStatus.TRANSITION_IN);
  if (GAME_CONFIG.audioEnabled) audio.playTransition();

  // Arena Zoom Sequence
  const duration = 1500;
  const start = performance.now();
  await new Promise<void>(resolve => {
    function animate(time: number) {
      const elapsed = time - start;
      const progress = Math.min(1, Math.max(0, elapsed / duration));
      renderer.setTransitionProgress(progress);
      if (progress < 1) requestAnimationFrame(animate); else resolve();
    }
    requestAnimationFrame(animate);
  });

  state.setStatus(GameStatus.PLAYING);
  isBooting = false;
});

// Audio Toggle Resume
toggleAudio.addEventListener('change', () => {
  if (toggleAudio.checked) audio.resume();
});

// Input logic
input.setOnTakeover(() => {
  const s = state.getState();
  if (s.isAutopilot) {
    state.setAutopilot(false);
    aiIndicator.classList.add('hidden');
    if (GAME_CONFIG.audioEnabled) audio.playTurn();
  }
});

input.setOnKeyPress(() => {
  if (GAME_CONFIG.audioEnabled) audio.playTurn();
  triggerHaptic('turn');
});

input.setOnRestart(() => {
  engine.setPaused(false);
  state.reset();
  state.setStatus(GameStatus.PLAYING);
  input.reset();
  hideGameOver();
  appEl.style.filter = 'none';
});

input.setOnRewindStart(() => {
  const s = state.getState();
  if (GAME_CONFIG.rewindEnabled && (s.status === GameStatus.GAME_OVER || s.status === GameStatus.PLAYING)) {
    engine.setPaused(false);
    state.setStatus(GameStatus.REWINDING);
    if (GAME_CONFIG.audioEnabled) audio.playRewind();
  }
});

input.setOnRewindEnd(async () => {
  if (state.getState().status === GameStatus.REWINDING) {
    state.setStatus(GameStatus.PLAYING);
    renderer.triggerResumeFlash();
    if (GAME_CONFIG.audioEnabled) audio.playTicker();
    hideGameOver();
    appEl.style.filter = 'none';
    
    // Protective 100ms pause to prevent instant death
    isFreezing = true;
    await new Promise(resolve => setTimeout(resolve, 100));
    isFreezing = false;
  }
});

// Engine
const engine = new Engine(
  { gridWidth: GRID_WIDTH, gridHeight: GRID_HEIGHT, logicFps: LOGIC_FPS, renderFps: 60 },
  async () => {
    if (isFreezing) return;
    
    try {
      const s = state.getState();
      const curStatus = s.status;
      
      if (curStatus === GameStatus.REWINDING) {
        state.update(Direction.UP);
        return;
      }
      if (curStatus !== GameStatus.PLAYING) return;

      const oldDir = s.direction;
      const nextDir = input.getNextDirection(s.direction);
      const oldScore = s.score;
      state.update(nextDir);

      const newState = state.getState();
      const targetFps = newState.isBulletTime ? newState.tickRate * 0.3 : newState.tickRate;
      engine.setLogicFps(targetFps);

      // Reactive Audio Sync
      if (GAME_CONFIG.audioEnabled) {
        const head = newState.snake[0];
        let minDist = 100;
        minDist = Math.min(minDist, head.x, GRID_WIDTH - 1 - head.x, head.y, GRID_HEIGHT - 1 - head.y);
        newState.snake.slice(1).forEach(seg => {
          const d = Math.abs(head.x - seg.x) + Math.abs(head.y - seg.y);
          minDist = Math.min(minDist, d);
        });
        audio.updateHeartbeat(newState.score, minDist);
      }

      if (newState.glitch === GlitchType.INVERT) {
        appEl.style.filter = 'invert(1)';
      } else {
        appEl.style.filter = 'none';
      }

      if (newState.direction !== oldDir) renderer.triggerTurnWobble();
      if (newState.score > oldScore) {
        if (GAME_CONFIG.audioEnabled) audio.playEat();
        renderer.emitEatEffect(newState.food.x, newState.food.y);
        renderer.triggerScreenShake();
        triggerHaptic('eat');
      }

      if (newState.status === GameStatus.GAME_OVER) {
        if (!state.wasLastDeathValid()) {
          state.rewindTick(true); // Emergency
          showToast("[ SYSTEM: GHOST_COLLISION_DETECTED -> EMERGENCY_REWIND ]");
          return;
        }

        engine.setPaused(true); // PAUSE_NOT_STOP
        if (GAME_CONFIG.audioEnabled) audio.playDeath();
        renderer.emitDeathEffect(newState.snake[0].x, newState.snake[0].y);
        renderer.triggerGlitch();
        triggerHaptic('death');
        await new Promise(resolve => setTimeout(resolve, 100));
        showGameOver(newState);
      }
    } catch (e) {
      // Logic fail-safe. Error handled in State.ts bounds checks.
    }
  },
  (alpha) => {
    if (isFreezing && state.getState().status !== GameStatus.REWINDING) return;
    
    // Visual Feedback for Spacebar on Game Over
    if (state.getState().status === GameStatus.GAME_OVER) {
      const pulseText = document.querySelector('.action-footer');
      if (pulseText) {
        if (input.isKeyPressed(' ')) pulseText.classList.add('active');
        else pulseText.classList.remove('active');
      }
    }

    renderer.render(state.getState(), state.getPrevState(), alpha, state.getSnapshots());
    updateScoreDisplays(state.getState().score);
  }
);

function updateScoreDisplays(score: number) {
  const formatted = score.toString().padStart(6, '0');
  scoreEl.innerText = `SERPENS // ${formatted}`;
  scoreEl.style.color = 'var(--accent-color)';
  multiIndicator.style.color = 'var(--accent-color)';
  aiIndicator.style.color = 'var(--accent-color)';
}

function showGameOver(s: any) {
  if (gameOverOverlay) return;
  gameOverOverlay = document.createElement('div');
  gameOverOverlay.className = 'game-over-overlay';
  gameOverOverlay.innerHTML = `
    <div class="failure-header">SYSTEM_FAILURE</div>
    <div class="stats-container">
      <div class="stats-row"><span>APEX_VELOCITY</span><span>${s.stats.apexVelocity.toFixed(1)} U/S</span></div>
      <div class="stats-row"><span>TOTAL_METERS</span><span>${s.stats.totalMeters} U</span></div>
      <div class="stats-row"><span>NEAR_MISSES</span><span>${s.stats.nearMisses}</span></div>
      <div class="stats-row" style="color: var(--accent-color); font-weight: 700"><span>FINAL_SCORE</span><span>${s.score}</span></div>
    </div>
    <div class="action-footer" style="margin-top: 20px">HOLD [R] TO REWIND OR [SPACE] TO RESTART</div>
  `;
  appEl.appendChild(gameOverOverlay);
}

function hideGameOver() { if (gameOverOverlay) { gameOverOverlay.remove(); gameOverOverlay = null; } }

async function runBootSequence() {
  state.setStatus(GameStatus.BOOT);
  document.body.classList.add('menu-active');
  await new Promise(resolve => setTimeout(resolve, 1500));
  const title = 'SERPENS';
  menuOverlay.classList.remove('hidden');
  for (let i = 0; i <= title.length; i++) {
    const text = title.substring(0, i);
    document.querySelector('#title-ticker')!.innerHTML = text;
    if (GAME_CONFIG.audioEnabled) audio.playTicker();
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  state.setStatus(GameStatus.MENU);
}

window.addEventListener('keydown', (e) => {
  const s = state.getState();
  if (e.code === 'KeyP') {
    if (GAME_CONFIG.autopilotEnabled) {
      const newAuto = !s.isAutopilot;
      state.setAutopilot(newAuto);
      if (newAuto) aiIndicator.classList.remove('hidden'); else aiIndicator.classList.add('hidden');
      if (GAME_CONFIG.audioEnabled) audio.playTurn();
    } else { showToast("[ SYSTEM: AUTOPILOT_LOCKED ]"); }
  }
});

window.addEventListener('biome-shift', (e: any) => {
  showToast(`[ SYSTEM: BIOME_SHIFT -> ${e.detail} ]`);
  if (GAME_CONFIG.audioEnabled) audio.playTransition();
});

window.addEventListener('biome-warning', (_e: any) => {
  showToast(`[ WARNING: GRAVITY_ANOMALY_DETECTED ]`);
  if (GAME_CONFIG.audioEnabled) audio.playGlitch();
  triggerHaptic('warning');
});

document.addEventListener('click', () => {
  if (state.getState().status === GameStatus.PLAYING) { window.focus(); }
});

runBootSequence();
engine.start();

console.groupEnd();

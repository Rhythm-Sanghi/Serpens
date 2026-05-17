export interface VaultTelemetry {
  highScore: number;
  totalMeters: number;
  gamesPlayed: number;
  nearMisses: number;
  voidEscapes: number;
  apexVelocity: number;
}

export interface PaletteDef {
  id: string;
  name: string;
  hue: number;
  hex: string;
  requirement: string;
  threshold: number;
  type: 'SCORE' | 'METERS' | 'MISSES' | 'ESCAPES' | 'FREE';
}

export class DataVault {
  private static STORAGE_KEY = 'SERPENS_DATA_VAULT';
  private static PALETTE_KEY = 'SERPENS_ACTIVE_PALETTE';

  private telemetry: VaultTelemetry = {
    highScore: 0,
    totalMeters: 0,
    gamesPlayed: 0,
    nearMisses: 0,
    voidEscapes: 0,
    apexVelocity: 0,
  };

  private activePaletteId: string = 'CYBER_CYAN';

  public readonly PALETTES: PaletteDef[] = [
    { id: 'CYBER_CYAN', name: 'CYBER CYAN', hue: 180, hex: '#00f2ff', requirement: 'UNLOCKED BY DEFAULT', threshold: 0, type: 'FREE' },
    { id: 'ACID_LIME', name: 'ACID LIME', hue: 120, hex: '#00ff66', requirement: 'NAVIGATE 1,000 METERS', threshold: 1000, type: 'METERS' },
    { id: 'HYPER_VIOLET', name: 'HYPER VIOLET', hue: 280, hex: '#bf00ff', requirement: 'REACH 2,500 HIGH SCORE', threshold: 2500, type: 'SCORE' },
    { id: 'SOLAR_GOLD', name: 'SOLAR GOLD', hue: 45, hex: '#ffd700', requirement: 'ACHIEVE 50 NEAR MISSES', threshold: 50, type: 'MISSES' },
    { id: 'CRIMSON_RAGE', name: 'CRIMSON RAGE', hue: 0, hex: '#ff003c', requirement: 'ESCAPE 15 SINGULARITIES', threshold: 15, type: 'ESCAPES' },
  ];

  constructor() {
    this.load();
  }

  public load(): void {
    try {
      const saved = localStorage.getItem(DataVault.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.telemetry = { ...this.telemetry, ...parsed };
      }
      const savedPalette = localStorage.getItem(DataVault.PALETTE_KEY);
      if (savedPalette && this.PALETTES.some(p => p.id === savedPalette)) {
        this.activePaletteId = savedPalette;
      }
    } catch (e) {
      console.warn("DataVault: Failed to load from localStorage", e);
    }
  }

  public save(): void {
    try {
      localStorage.setItem(DataVault.STORAGE_KEY, JSON.stringify(this.telemetry));
      localStorage.setItem(DataVault.PALETTE_KEY, this.activePaletteId);
    } catch (e) {
      console.warn("DataVault: Failed to save to localStorage", e);
    }
  }

  public getTelemetry(): VaultTelemetry {
    return this.telemetry;
  }

  public updateTelemetry(data: Partial<VaultTelemetry>): string[] {
    const unlockedNow: string[] = [];
    
    // Check what was unlocked BEFORE update
    const prevUnlocked = new Set(this.getUnlockedPalettes().map(p => p.id));

    if (data.highScore && data.highScore > this.telemetry.highScore) this.telemetry.highScore = data.highScore;
    if (data.totalMeters) this.telemetry.totalMeters += data.totalMeters;
    if (data.gamesPlayed) this.telemetry.gamesPlayed += data.gamesPlayed;
    if (data.nearMisses) this.telemetry.nearMisses += data.nearMisses;
    if (data.voidEscapes) this.telemetry.voidEscapes += data.voidEscapes;
    if (data.apexVelocity && data.apexVelocity > this.telemetry.apexVelocity) this.telemetry.apexVelocity = data.apexVelocity;

    this.save();

    // Check what is unlocked AFTER update
    const currUnlocked = this.getUnlockedPalettes();
    for (const p of currUnlocked) {
      if (!prevUnlocked.has(p.id)) {
        unlockedNow.push(p.name);
      }
    }

    return unlockedNow;
  }

  public isUnlocked(palette: PaletteDef): boolean {
    if (palette.type === 'FREE') return true;
    if (palette.type === 'METERS') return this.telemetry.totalMeters >= palette.threshold;
    if (palette.type === 'SCORE') return this.telemetry.highScore >= palette.threshold;
    if (palette.type === 'MISSES') return this.telemetry.nearMisses >= palette.threshold;
    if (palette.type === 'ESCAPES') return this.telemetry.voidEscapes >= palette.threshold;
    return false;
  }

  public getUnlockedPalettes(): PaletteDef[] {
    return this.PALETTES.filter(p => this.isUnlocked(p));
  }

  public getActivePalette(): PaletteDef {
    return this.PALETTES.find(p => p.id === this.activePaletteId) || this.PALETTES[0];
  }

  public getPaletteProgress(palette: PaletteDef): { current: number; max: number; percentage: number } {
    if (palette.type === 'FREE') return { current: 1, max: 1, percentage: 100 };
    let curr = 0;
    if (palette.type === 'METERS') curr = this.telemetry.totalMeters;
    if (palette.type === 'SCORE') curr = this.telemetry.highScore;
    if (palette.type === 'MISSES') curr = this.telemetry.nearMisses;
    if (palette.type === 'ESCAPES') curr = this.telemetry.voidEscapes;
    
    const percentage = Math.min(100, Math.max(0, Math.floor((curr / palette.threshold) * 100)));
    return { current: curr, max: palette.threshold, percentage };
  }

  public setActivePalette(id: string): boolean {
    const palette = this.PALETTES.find(p => p.id === id);
    if (palette && this.isUnlocked(palette)) {
      this.activePaletteId = id;
      this.save();
      return true;
    }
    return false;
  }
}

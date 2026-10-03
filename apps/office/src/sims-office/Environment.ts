import * as THREE from 'three';

/**
 * Day / night cycle for the Sims office.
 *
 * Owns every global light (sun/moon, hemisphere sky light, ambient), the sky
 * colour + fog, and drives registered "night emissives" (lamps, street lights,
 * window glass, city windows) and wall clocks. Time follows the local clock by
 * default ("live") or a fixed preset.
 */

export type TimeMode = 'live' | 'morning' | 'noon' | 'evening' | 'night';
export const TIME_MODES: TimeMode[] = ['live', 'morning', 'noon', 'evening', 'night'];
export const TIME_PRESETS: Record<Exclude<TimeMode, 'live'>, number> = {
  morning: 8.0,
  noon: 12.5,
  evening: 17.75,
  night: 21.5,
};

interface SkyKey {
  h: number;
  sky: number;
  sun: number;
  sunI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  /** 0 = lamps off (bright day) … 1 = full night lighting */
  lamp: number;
  exposure: number;
}

const NIGHT: Omit<SkyKey, 'h'> = {
  sky: 0x0d1830,
  sun: 0x9db4ff,
  sunI: 0.35,
  hemiSky: 0x2a3a66,
  hemiGround: 0x0e0e16,
  hemiI: 0.45,
  lamp: 1,
  exposure: 1.0,
};

const SKY_KEYS: SkyKey[] = [
  { h: 0, ...NIGHT },
  { h: 5.0, ...NIGHT },
  { h: 6.5, sky: 0xf4b08a, sun: 0xffb27a, sunI: 0.95, hemiSky: 0xc3b0e0, hemiGround: 0x3d2c22, hemiI: 0.6, lamp: 0.55, exposure: 1.0 },
  { h: 9.0, sky: 0xa6d8f7, sun: 0xfff1d8, sunI: 1.55, hemiSky: 0xd4ecff, hemiGround: 0x5c4c3c, hemiI: 0.8, lamp: 0.15, exposure: 1.05 },
  { h: 13.0, sky: 0x93cff8, sun: 0xffffff, sunI: 1.75, hemiSky: 0xdcf0ff, hemiGround: 0x605242, hemiI: 0.85, lamp: 0.1, exposure: 1.05 },
  { h: 16.3, sky: 0xaccfe6, sun: 0xffe4b5, sunI: 1.5, hemiSky: 0xe6ecf5, hemiGround: 0x5a4636, hemiI: 0.75, lamp: 0.25, exposure: 1.05 },
  { h: 18.0, sky: 0xf28f5f, sun: 0xff9c58, sunI: 1.05, hemiSky: 0xe7a888, hemiGround: 0x3c261a, hemiI: 0.6, lamp: 0.75, exposure: 1.0 },
  { h: 19.5, sky: 0x2c2655, sun: 0x8080dd, sunI: 0.45, hemiSky: 0x3c3670, hemiGround: 0x130f1a, hemiI: 0.45, lamp: 1, exposure: 1.0 },
  { h: 24, ...NIGHT },
];

export interface SkySample {
  sky: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  lamp: number;
  exposure: number;
}

/** Interpolated lighting for a given hour (0–24). Pure; used by tests. */
export function sampleSky(hour: number): SkySample {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= h) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  const c = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    sky: c(a.sky, b.sky),
    sun: c(a.sun, b.sun),
    sunI: n(a.sunI, b.sunI),
    hemiSky: c(a.hemiSky, b.hemiSky),
    hemiGround: c(a.hemiGround, b.hemiGround),
    hemiI: n(a.hemiI, b.hemiI),
    lamp: n(a.lamp, b.lamp),
    exposure: n(a.exposure, b.exposure),
  };
}

/** Unit vector pointing from the scene toward the sun (or moon at night). */
export function sunDirection(hour: number): THREE.Vector3 {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h <= 18.5) {
    const t = (h - 6) / 12.5; // 0 sunrise … 1 sunset
    const elevation = THREE.MathUtils.degToRad(12 + Math.sin(Math.PI * t) * 55);
    // rises in the east (+X), passes the south (+Z), sets in the west (-X)
    const azimuth = Math.PI * t;
    return new THREE.Vector3(
      Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(azimuth) * Math.cos(elevation) * 0.8 + 0.35
    ).normalize();
  }
  // moonlight: soft, high, from the south-west
  return new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
}

export function phaseLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 11) return 'Pagi';
  if (h >= 11 && h < 15) return 'Siang';
  if (h >= 15 && h < 18.5) return 'Sore';
  return 'Malam';
}

interface NightEmissive {
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  day: number;
  night: number;
  /** for basic materials (glow decals) we drive opacity instead of emissive */
  mode: 'emissive' | 'opacity';
}

interface WallClock {
  hour: THREE.Object3D;
  minute: THREE.Object3D;
}

const STORAGE_KEY = 'aos.sims.timeMode';

export class Environment {
  public readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly interiorLights: Array<{ light: THREE.PointLight; base: number }> = [];
  private readonly emissives: NightEmissive[] = [];
  private readonly windows: THREE.MeshStandardMaterial[] = [];
  private readonly clocks: WallClock[] = [];
  private mode: TimeMode = 'live';
  private hour = 12;
  private readonly fog: THREE.Fog;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer | null) {
    this.scene = scene;
    this.renderer = renderer;

    try {
      const saved = localStorage.getItem(STORAGE_KEY) as TimeMode | null;
      if (saved && TIME_MODES.includes(saved)) this.mode = saved;
    } catch {
      // default live
    }

    this.hemi = new THREE.HemisphereLight(0xdcf0ff, 0x605242, 0.8);
    scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.camera.left = -26;
    this.sun.shadow.camera.right = 26;
    this.sun.shadow.camera.top = 26;
    this.sun.shadow.camera.bottom = -26;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Camera sits ~38 units from its target; fade the far lot into the sky.
    this.fog = new THREE.Fog(0x93cff8, 55, 95);
    scene.fog = this.fog;

    this.apply(true);
  }

  /** Warm interior room light (no shadows). `base` is intensity at full night. */
  public addInteriorLight(x: number, z: number, base = 6, color = 0xffd9a8, y = 2.3, distance = 9): THREE.PointLight {
    const light = new THREE.PointLight(color, base, distance, 1.6);
    light.position.set(x, y, z);
    this.scene.add(light);
    this.interiorLights.push({ light, base });
    return light;
  }

  public registerNightEmissive(material: NightEmissive['material'], night: number, day = 0, mode: NightEmissive['mode'] = 'emissive'): void {
    this.emissives.push({ material, night, day, mode });
  }

  public registerWindow(material: THREE.MeshStandardMaterial): void {
    this.windows.push(material);
  }

  public registerClock(hour: THREE.Object3D, minute: THREE.Object3D): void {
    this.clocks.push({ hour, minute });
  }

  public getMode(): TimeMode {
    return this.mode;
  }

  public setMode(mode: TimeMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
    this.apply(false);
  }

  public cycleMode(): TimeMode {
    const next = TIME_MODES[(TIME_MODES.indexOf(this.mode) + 1) % TIME_MODES.length];
    this.setMode(next);
    return next;
  }

  public getHour(): number {
    return this.hour;
  }

  public getNightFactor(): number {
    return sampleSky(this.hour).lamp;
  }

  public unregisterNightEmissive(material: THREE.Material): void {
    const idx = this.emissives.findIndex((e) => e.material === material);
    if (idx !== -1) {
      this.emissives.splice(idx, 1);
    }
  }

  public getLabel(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return `${hhmm} · ${phaseLabel(this.hour)}${this.mode === 'live' ? '' : ' (preset)'}`;
  }

  private targetHour(): number {
    if (this.mode === 'live') {
      const now = new Date();
      return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    }
    return TIME_PRESETS[this.mode];
  }

  /** Smoothly advance toward the target time and apply lighting. */
  public update(dt: number): void {
    const target = this.targetHour();
    let d = target - this.hour;
    if (d > 12) d -= 24;
    if (d < -12) d += 24;
    // jump quickly between presets, follow the real clock exactly
    this.hour = Math.abs(d) < 0.01 ? target : (this.hour + d * Math.min(1, dt * 2.5) + 24) % 24;
    this.apply(false);
  }

  private apply(snap: boolean): void {
    if (snap) this.hour = this.targetHour();
    const s = sampleSky(this.hour);

    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunI;
    const dir = sunDirection(this.hour);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 50);

    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiI;
    this.ambient.intensity = 0.12 + 0.08 * (1 - s.lamp);

    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(s.sky);
    else this.scene.background = s.sky.clone();
    this.fog.color.copy(s.sky);
    if (this.renderer) this.renderer.toneMappingExposure = s.exposure;

    for (const { light, base } of this.interiorLights) {
      // offices keep some light on during the day; full warmth at night
      light.intensity = base * (0.25 + 0.75 * s.lamp);
    }
    for (const e of this.emissives) {
      const v = e.day + (e.night - e.day) * s.lamp;
      if (e.mode === 'opacity') {
        e.material.opacity = v;
      } else if ('emissiveIntensity' in e.material) {
        e.material.emissiveIntensity = v;
      }
    }
    for (const w of this.windows) {
      w.emissive.copy(s.sky).lerp(new THREE.Color(0xffd28a), s.lamp * 0.35);
      w.emissiveIntensity = 0.55 + 0.25 * (1 - s.lamp);
    }
    const h12 = this.hour % 12;
    const minutes = (this.hour % 1) * 60;
    for (const c of this.clocks) {
      c.hour.rotation.z = -(h12 / 12) * Math.PI * 2;
      c.minute.rotation.z = -(minutes / 60) * Math.PI * 2;
    }
  }
}

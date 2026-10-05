import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CharacterLibrary,
  type AnimSlot,
  type CharacterRig,
} from '../sims-office/CharacterRig.ts';
import {
  type CustomCharacterConfig,
  type CharacterGender,
  type GlassesType,
  MODEL_OPTIONS,
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  CLOTHING_COLORS,
  PLUMBOB_PALETTE,
  STYLE_PRESETS,
  loadCharacterConfig,
  saveCharacterConfig,
  resetCharacterConfig,
  generateRandomCharacter,
  configToOutfit,
} from '../sims-office/CharacterCustomizer.ts';
import { PROFILES } from '../hermes/labels.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';

interface CharacterStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProfile?: string;
  onSaved?: (config: CustomCharacterConfig) => void;
}

type StudioTab = 'face' | 'clothing' | 'sims';

let studioLibrary: CharacterLibrary | null = null;
function getStudioLibrary(): CharacterLibrary {
  if (!studioLibrary) {
    const loader = new GLTFLoader();
    studioLibrary = new CharacterLibrary(
      `${import.meta.env.BASE_URL}sims/characters/`,
      (url) => loader.loadAsync(url)
    );
  }
  return studioLibrary;
}

export const CharacterStudioModal: React.FC<CharacterStudioModalProps> = ({
  isOpen,
  onClose,
  initialProfile = 'chief',
  onSaved,
}) => {
  const [activeProfile, setActiveProfile] = useState<string>(initialProfile);
  const [config, setConfig] = useState<CustomCharacterConfig>(() =>
    loadCharacterConfig(initialProfile)
  );
  const [activeTab, setActiveTab] = useState<StudioTab>('face');
  const [currentAnim, setCurrentAnim] = useState<AnimSlot>('idle');
  const [autoRotate, setAutoRotate] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 3D Canvas Refs
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rigRef = useRef<CharacterRig | null>(null);
  const turntableGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());
  const isDraggingRef = useRef(false);
  const previousMouseXRef = useRef(0);
  const cameraDistanceRef = useRef(2.7);

  // Sync profile when initialProfile changes or user selects new profile
  useEffect(() => {
    if (isOpen) {
      const target = initialProfile || 'chief';
      setActiveProfile(target);
      setConfig(loadCharacterConfig(target));
      setCurrentAnim('idle');
    }
  }, [isOpen, initialProfile]);

  const handleSwitchProfile = (p: string) => {
    simsAudio.playClick();
    setActiveProfile(p);
    setConfig(loadCharacterConfig(p));
    setCurrentAnim('idle');
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // -------------------------------------------------------------------------
  // 3D Live Viewport Lifecycle
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !canvasContainerRef.current) return;

    const container = canvasContainerRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 460;

    // 1. Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0a1122);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    camera.position.set(0, 1.05, cameraDistanceRef.current);
    camera.lookAt(0, 0.95, 0);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
    keyLight.position.set(2.5, 4.5, 3.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.6);
    rimLight.position.set(-2.5, 3.0, -2.5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xa855f7, 0.8);
    fillLight.position.set(0, -1.0, 2.5);
    scene.add(fillLight);

    // 5. Turntable Stage (Podium)
    const turntable = new THREE.Group();
    turntable.name = 'turntable';
    scene.add(turntable);
    turntableGroupRef.current = turntable;

    // Stage disc
    const stageGeo = new THREE.CylinderGeometry(0.85, 0.9, 0.05, 36);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x111c38,
      roughness: 0.4,
      metalness: 0.6,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = -0.025;
    stage.receiveShadow = true;
    turntable.add(stage);

    // Glowing ring
    const ringGeo = new THREE.RingGeometry(0.81, 0.85, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    turntable.add(ring);

    // 6. Animation Render Loop
    let destroyed = false;
    lastTimeRef.current = performance.now();

    const render = () => {
      if (destroyed) return;
      animFrameRef.current = requestAnimationFrame(render);

      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      if (autoRotate && turntableGroupRef.current) {
        turntableGroupRef.current.rotation.y += dt * 0.7;
      }

      if (rigRef.current) {
        rigRef.current.update(dt);
      }

      renderer.render(scene, camera);
    };

    render();

    // Resize handler
    const onResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      destroyed = true;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animFrameRef.current);
      if (rigRef.current) {
        rigRef.current.dispose();
        rigRef.current = null;
      }
      renderer.dispose();
      stageGeo.dispose();
      stageMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      container.innerHTML = '';
    };
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // Reactively Load or Update Rig on Config / Model Change
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !turntableGroupRef.current) return;

    let isSubscribed = true;
    const outfit = configToOutfit(config);
    const currentRig = rigRef.current;

    // Fast path: if model is identical, update colors & accessories in-place
    if (currentRig && currentRig.model === config.model) {
      if (outfit.colors) {
        currentRig.updateColors(outfit.colors);
      }
      currentRig.setHeightScale(config.heightScale ?? 1.0);
      currentRig.setGlasses(config.glasses ?? 'none');
      return;
    }

    // Model changed or initial load: instantiate new rig
    const loadModel = async () => {
      try {
        const newRig = await getStudioLibrary().create(outfit);
        if (!isSubscribed || !turntableGroupRef.current) {
          newRig.dispose();
          return;
        }

        if (rigRef.current) {
          turntableGroupRef.current.remove(rigRef.current.object);
          rigRef.current.dispose();
        }

        newRig.setHeightScale(config.heightScale ?? 1.0);
        newRig.setGlasses(config.glasses ?? 'none');
        newRig.play(currentAnim, 0);

        turntableGroupRef.current.add(newRig.object);
        rigRef.current = newRig;
      } catch (err) {
        console.warn('Failed to load studio character model:', err);
      }
    };

    void loadModel();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, config.model]);

  // Reactive updates for colors, scale, and glasses when config properties change
  useEffect(() => {
    if (!rigRef.current) return;
    const outfit = configToOutfit(config);
    if (outfit.colors) {
      rigRef.current.updateColors(outfit.colors);
    }
    rigRef.current.setHeightScale(config.heightScale ?? 1.0);
    rigRef.current.setGlasses(config.glasses ?? 'none');
  }, [
    config.skinColor,
    config.hairColor,
    config.eyeColor,
    config.eyebrowColor,
    config.topColor,
    config.bottomColor,
    config.accentColor,
    config.shoesColor,
    config.glasses,
    config.heightScale,
  ]);

  // -------------------------------------------------------------------------
  // Animation Slot Trigger
  // -------------------------------------------------------------------------
  const playPreviewAnim = (slot: AnimSlot) => {
    simsAudio.playBubbleClick();
    setCurrentAnim(slot);
    rigRef.current?.play(slot, 0.25);
  };

  // -------------------------------------------------------------------------
  // Mouse / Drag Rotation Controls on Viewport
  // -------------------------------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMouseXRef.current = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !turntableGroupRef.current) return;
    const deltaX = e.clientX - previousMouseXRef.current;
    previousMouseXRef.current = e.clientX;
    turntableGroupRef.current.rotation.y += deltaX * 0.015;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!cameraRef.current) return;
    const nextDist = Math.max(1.6, Math.min(cameraDistanceRef.current + e.deltaY * 0.002, 3.6));
    cameraDistanceRef.current = nextDist;
    cameraRef.current.position.z = nextDist;
  };

  // -------------------------------------------------------------------------
  // Preset & Style Helpers
  // -------------------------------------------------------------------------
  const handleApplyPreset = (preset: (typeof STYLE_PRESETS)[number]) => {
    simsAudio.playTabSwitch();
    setConfig((prev) => ({
      ...prev,
      ...preset.config,
    }));
    showToast(`Preset "${preset.name}" diterapkan!`);
  };

  const handleRandomize = () => {
    simsAudio.playSelectSim();
    const randomized = generateRandomCharacter(activeProfile, config.gender);
    setConfig(randomized);
    showToast('🎲 Gaya karakter diacak!');
  };

  const handleReset = () => {
    simsAudio.playClick();
    const reset = resetCharacterConfig(activeProfile);
    setConfig(reset);
    showToast('Karakter dikembalikan ke default.');
  };

  const handleSave = () => {
    simsAudio.playSuccess();
    saveCharacterConfig(config);
    onSaved?.(config);
    showToast('✨ Karakter berhasil disimpan!');
    setTimeout(() => {
      onClose();
    }, 400);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-fadeIn"
      onMouseUp={handleMouseUp}
    >
      <div className="w-full max-w-5xl bg-slate-900/95 border border-sky-400/40 rounded-2xl shadow-2xl shadow-sky-950/60 overflow-hidden flex flex-col text-slate-100 max-h-[94vh]">
        {/* HEADER */}
        <div className="px-5 py-3.5 border-b border-sky-500/20 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shadow-lg border border-sky-400/30"
              style={{
                backgroundColor: `${config.plumbobColor}22`,
                boxShadow: `0 0 12px ${config.plumbobColor}55`,
              }}
            >
              💎
            </span>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                The Sims 2 — Character Studio & Wardrobe
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  CAS Editor
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Kustomisasi wajah, model busana, warna pakaian, dan atribut personal agen
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRandomize}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Acak Tampilan & Busana"
            >
              <span>🎲</span>
              <span className="hidden sm:inline">Acak (Dadu)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                simsAudio.playClick();
                onClose();
              }}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors text-base cursor-pointer"
              title="Tutup (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* AGENTS SELECTOR STRIP */}
        <div className="px-5 py-2 border-b border-white/5 bg-slate-950/40 flex items-center gap-2 overflow-x-auto text-xs no-scrollbar">
          <span className="text-[11px] font-mono text-slate-400 uppercase shrink-0 font-bold">
            Pilih Karakter:
          </span>
          <button
            type="button"
            onClick={() => handleSwitchProfile('owner')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer border flex items-center gap-1.5 ${
              activeProfile === 'owner'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30'
                : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
            }`}
          >
            <span>👑</span>
            <span>Owner (Anda)</span>
          </button>
          <div className="w-[1px] h-4 bg-white/10 shrink-0" />
          {PROFILES.map((p) => {
            const isCurrent = p === activeProfile;
            return (
              <button
                key={p}
                type="button"
                onClick={() => handleSwitchProfile(p)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all shrink-0 cursor-pointer border ${
                  isCurrent
                    ? 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-md shadow-sky-500/30'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10 hover:border-white/20'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* MAIN BODY: 2 COLUMNS (3D Viewport on Left, Controls on Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
          {/* LEFT: 3D VIEWPORT */}
          <div className="lg:col-span-5 bg-gradient-to-b from-slate-950 to-slate-900 relative flex flex-col items-center justify-between border-b lg:border-b-0 lg:border-r border-white/10 select-none">
            {/* Viewport Canvas Container */}
            <div
              ref={canvasContainerRef}
              className="w-full flex-1 cursor-grab active:cursor-grabbing min-h-[300px] lg:min-h-[440px]"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              title="Klik dan geser untuk memutar karakter 360°, scroll untuk zoom"
            />

            {/* Quick Animation Controls & Viewport Overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px]">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: config.plumbobColor }}
              />
              <span className="font-mono text-slate-300 capitalize">{activeProfile}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-400 font-mono text-[10px]">
                {Math.round((config.heightScale ?? 1.0) * 172)} cm
              </span>
            </div>

            <div className="absolute top-3 right-3 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  simsAudio.playClick();
                  setAutoRotate(!autoRotate);
                }}
                className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                  autoRotate
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : 'bg-slate-950/70 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
                title="Putar Otomatis 360°"
              >
                🔄
              </button>
            </div>

            {/* Animation Bar at Viewport Bottom */}
            <div className="w-full p-2.5 bg-slate-950/80 border-t border-white/10 backdrop-blur-md flex items-center justify-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-[10px] uppercase font-mono text-slate-400 mr-1 hidden sm:inline">
                Aksi:
              </span>
              <button
                type="button"
                onClick={() => playPreviewAnim('idle')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  currentAnim === 'idle'
                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                🧘 Santai
              </button>
              <button
                type="button"
                onClick={() => playPreviewAnim('wave')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  currentAnim === 'wave'
                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                👋 Lambaikan
              </button>
              <button
                type="button"
                onClick={() => playPreviewAnim('talk')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  currentAnim === 'talk'
                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                🗣️ Bicara
              </button>
              <button
                type="button"
                onClick={() => playPreviewAnim('clap')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  currentAnim === 'clap'
                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                👏 Tepuk Tangan
              </button>
              <button
                type="button"
                onClick={() => playPreviewAnim('walk')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  currentAnim === 'walk'
                    ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                🚶 Jalan
              </button>
            </div>
          </div>

          {/* RIGHT: CUSTOMIZATION PANELS */}
          <div className="lg:col-span-7 flex flex-col min-h-0 bg-slate-900/90 overflow-hidden">
            {/* TABS HEADER */}
            <div className="grid grid-cols-3 border-b border-white/10 bg-slate-950/50 text-xs font-semibold text-center">
              <button
                type="button"
                onClick={() => {
                  simsAudio.playTabSwitch();
                  setActiveTab('face');
                }}
                className={`py-3 border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'face'
                    ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <span>👤</span>
                <span>Wajah & Kepala</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  simsAudio.playTabSwitch();
                  setActiveTab('clothing');
                }}
                className={`py-3 border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'clothing'
                    ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <span>👔</span>
                <span>Busana & Pakaian</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  simsAudio.playTabSwitch();
                  setActiveTab('sims');
                }}
                className={`py-3 border-b-2 transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'sims'
                    ? 'border-sky-400 text-sky-300 font-bold bg-sky-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <span>💎</span>
                <span>Proporsi & Sims</span>
              </button>
            </div>

            {/* QUICK PRESET CHIPS BAR */}
            <div className="px-5 py-2.5 bg-slate-950/30 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
              <span className="text-slate-400 uppercase font-mono text-[10px] shrink-0 font-bold">
                Preset Gaya:
              </span>
              {STYLE_PRESETS.map((pst) => (
                <button
                  key={pst.name}
                  type="button"
                  onClick={() => handleApplyPreset(pst)}
                  className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-white/10 hover:border-sky-500/30 shrink-0 transition-all flex items-center gap-1 cursor-pointer"
                  title={pst.desc}
                >
                  <span>{pst.icon}</span>
                  <span>{pst.name}</span>
                </button>
              ))}
            </div>

            {/* TAB CONTENTS (Scrollable) */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 min-h-0">
              {/* TAB 1: WAJAH & KEPALA */}
              {activeTab === 'face' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* GENDER / ARCHETYPE */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-sky-300 flex items-center justify-between">
                      <span>Gaya Siluet & Gender Karakter</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Mempengaruhi rekomendasi postur dan busana
                      </span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'male', label: 'Pria (Maskulin)', icon: '👨' },
                        { id: 'female', label: 'Wanita (Feminin)', icon: '👩' },
                        { id: 'non-binary', label: 'Cyber / Synth', icon: '🤖' },
                      ].map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            simsAudio.playBubbleClick();
                            setConfig({ ...config, gender: g.id as CharacterGender });
                          }}
                          className={`p-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
                            config.gender === g.id
                              ? 'bg-sky-500/20 text-sky-300 border-sky-400 shadow-sm'
                              : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/5'
                          }`}
                        >
                          <span>{g.icon}</span>
                          <span>{g.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SKIN TONE */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>🎨</span>
                        <span>Warna Kulit (Skin Tone)</span>
                      </label>
                      <input
                        type="color"
                        value={config.skinColor}
                        onChange={(e) => setConfig({ ...config, skinColor: e.target.value })}
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-9 gap-1.5">
                      {SKIN_TONES.map((tone) => {
                        const isSelected = tone.color.toLowerCase() === config.skinColor.toLowerCase();
                        return (
                          <button
                            key={tone.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, skinColor: tone.color });
                            }}
                            className={`h-8 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: tone.color }}
                            title={tone.name}
                          >
                            {isSelected && <span className="text-[10px] text-slate-950 font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* HAIR COLOR */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>💇</span>
                        <span>Warna Rambut & Alis</span>
                      </label>
                      <input
                        type="color"
                        value={config.hairColor}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            hairColor: e.target.value,
                            eyebrowColor: e.target.value,
                          })
                        }
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                      {HAIR_COLORS.map((hair) => {
                        const isSelected = hair.color.toLowerCase() === config.hairColor.toLowerCase();
                        return (
                          <button
                            key={hair.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({
                                ...config,
                                hairColor: hair.color,
                                eyebrowColor: hair.color,
                              });
                            }}
                            className={`h-8 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: hair.color }}
                            title={hair.name}
                          >
                            {isSelected && <span className="text-[10px] text-white font-bold drop-shadow">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* EYE COLOR */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>👁️</span>
                        <span>Warna Iris Mata</span>
                      </label>
                      <input
                        type="color"
                        value={config.eyeColor}
                        onChange={(e) => setConfig({ ...config, eyeColor: e.target.value })}
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {EYE_COLORS.map((eye) => {
                        const isSelected = eye.color.toLowerCase() === config.eyeColor.toLowerCase();
                        return (
                          <button
                            key={eye.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, eyeColor: eye.color });
                            }}
                            className={`h-8 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: eye.color }}
                            title={eye.name}
                          >
                            {isSelected && <span className="text-[10px] text-white font-bold drop-shadow">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* GLASSES ACCESSORY */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>👓</span>
                      <span>Aksesori Kacamata & Visor</span>
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'none', label: 'Tanpa Kacamata', icon: '🚫' },
                        { id: 'reading', label: 'Kacamata Baca', icon: '👓' },
                        { id: 'sunglasses', label: 'Kacamata Hitam', icon: '🕶️' },
                        { id: 'cyber', label: 'Cyber Visor (Neon)', icon: '⚡' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            simsAudio.playBubbleClick();
                            setConfig({ ...config, glasses: item.id as GlassesType });
                          }}
                          className={`p-2.5 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all border cursor-pointer ${
                            config.glasses === item.id
                              ? 'bg-sky-500/20 text-sky-300 border-sky-400 shadow-sm'
                              : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/5'
                          }`}
                        >
                          <span className="text-base">{item.icon}</span>
                          <span className="text-[11px] text-center">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: BUSANA & PAKAIAN */}
              {activeTab === 'clothing' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* MODEL SELECTION */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-sky-300 flex items-center justify-between">
                      <span>Tipe Model Busana (Archetype Outfit)</span>
                      <span className="text-[10px] font-mono text-slate-400">Pondasi 3D GLB</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {MODEL_OPTIONS.map((m) => {
                        const isSelected = m.id === config.model;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              simsAudio.playSelectSim();
                              setConfig({ ...config, model: m.id });
                            }}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                              isSelected
                                ? 'bg-sky-500/15 border-sky-400 shadow-md shadow-sky-500/20 ring-1 ring-sky-400/50'
                                : 'bg-slate-950/40 hover:bg-slate-950/70 border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="text-2xl shrink-0 p-1.5 rounded-lg bg-white/5">{m.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-xs text-white">{m.label}</span>
                                  <span
                                    className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                      isSelected
                                        ? 'bg-sky-500 text-slate-950 font-bold'
                                        : 'bg-white/10 text-slate-400'
                                    }`}
                                  >
                                    {m.badge}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                  {m.desc}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* TOP COLOR (ATASAN / JAS / KEMEJA / JAKET) */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>🧥</span>
                        <span>Warna Pakaian Atasan (Jas / Kemeja / Jaket)</span>
                      </label>
                      <input
                        type="color"
                        value={config.topColor}
                        onChange={(e) => setConfig({ ...config, topColor: e.target.value })}
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
                      {CLOTHING_COLORS.map((c) => {
                        const isSelected = c.color.toLowerCase() === config.topColor.toLowerCase();
                        return (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, topColor: c.color });
                            }}
                            className={`h-7 rounded-md border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          >
                            {isSelected && <span className="text-[10px] text-white font-bold drop-shadow">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* BOTTOM COLOR (CELANA / BAWAHAN) */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>👖</span>
                        <span>Warna Celana / Bawahan</span>
                      </label>
                      <input
                        type="color"
                        value={config.bottomColor}
                        onChange={(e) => setConfig({ ...config, bottomColor: e.target.value })}
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
                      {CLOTHING_COLORS.map((c) => {
                        const isSelected = c.color.toLowerCase() === config.bottomColor.toLowerCase();
                        return (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, bottomColor: c.color });
                            }}
                            className={`h-7 rounded-md border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          >
                            {isSelected && <span className="text-[10px] text-white font-bold drop-shadow">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ACCENT / TIE / INNER SHIRT */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>👔</span>
                        <span>Warna Dasi / Kaos Dalam / Aksen Kerah</span>
                      </label>
                      <input
                        type="color"
                        value={config.accentColor}
                        onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
                      {CLOTHING_COLORS.map((c) => {
                        const isSelected = c.color.toLowerCase() === config.accentColor.toLowerCase();
                        return (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, accentColor: c.color });
                            }}
                            className={`h-7 rounded-md border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          >
                            {isSelected && <span className="text-[10px] text-white font-bold drop-shadow">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* SHOES COLOR */}
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>👞</span>
                        <span>Warna Sepatu & Sabuk</span>
                      </label>
                      <input
                        type="color"
                        value={config.shoesColor}
                        onChange={(e) => setConfig({ ...config, shoesColor: e.target.value })}
                        className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                        title="Pilih Warna Kustom"
                      />
                    </div>
                    <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5">
                      {CLOTHING_COLORS.map((c) => {
                        const isSelected = c.color.toLowerCase() === config.shoesColor.toLowerCase();
                        return (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, shoesColor: c.color });
                            }}
                            className={`h-7 rounded-md border transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'border-sky-400 ring-2 ring-sky-400/50 scale-105'
                                : 'border-black/30 hover:scale-102 opacity-90'
                            }`}
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                          >
                            {isSelected && <span className="text-[10px] text-white font-bold drop-shadow">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PROPORSI & SIMS */}
              {activeTab === 'sims' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* HEIGHT SLIDER */}
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>📏</span>
                        <span>Tinggi Badan (Skala Karakter)</span>
                      </label>
                      <span className="text-xs font-mono text-sky-300 font-bold">
                        {Math.round((config.heightScale ?? 1.0) * 172)} cm (
                        {Math.round((config.heightScale ?? 1.0) * 100)}%)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.88"
                      max="1.14"
                      step="0.01"
                      value={config.heightScale ?? 1.0}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          heightScale: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-sky-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>Kecil / Mungil (151 cm)</span>
                      <span>Standar (172 cm)</span>
                      <span>Tinggi / Jenjang (196 cm)</span>
                    </div>
                  </div>

                  {/* PLUMBOB GEM COLOR */}
                  <div className="p-4 rounded-xl bg-slate-950/40 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>💎</span>
                        <span>Warna Permata Plumbob Sims</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20"
                          style={{ backgroundColor: config.plumbobColor }}
                        />
                        <input
                          type="color"
                          value={config.plumbobColor}
                          onChange={(e) => setConfig({ ...config, plumbobColor: e.target.value })}
                          className="w-6 h-6 rounded border border-white/20 cursor-pointer bg-transparent"
                          title="Pilih Warna Plumbob Kustom"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {PLUMBOB_PALETTE.map((pb) => {
                        const isSelected = pb.color.toLowerCase() === config.plumbobColor.toLowerCase();
                        return (
                          <button
                            key={pb.color}
                            type="button"
                            onClick={() => {
                              simsAudio.playBubbleClick();
                              setConfig({ ...config, plumbobColor: pb.color });
                            }}
                            className={`p-2 rounded-lg border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                              isSelected
                                ? 'bg-white/10 border-sky-400 shadow-md ring-1 ring-sky-400/50 scale-102'
                                : 'bg-white/5 hover:bg-white/10 border-white/5'
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full shadow-inner"
                              style={{
                                backgroundColor: pb.color,
                                boxShadow: `0 0 8px ${pb.color}88`,
                              }}
                            />
                            <span className="text-[10px] text-slate-300 font-mono truncate w-full text-center">
                              {pb.name.split(' ')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* TOAST FEEDBACK */}
            {toastMsg && (
              <div className="mx-5 mb-2 p-2 bg-emerald-950/80 border border-emerald-500/40 rounded-lg text-emerald-200 text-xs flex items-center justify-between animate-fadeIn">
                <span>✓ {toastMsg}</span>
              </div>
            )}

            {/* FOOTER ACTIONS */}
            <div className="px-5 py-3.5 border-t border-white/10 bg-slate-950/80 flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Reset Default
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    simsAudio.playClick();
                    onClose();
                  }}
                  className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/25 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>💾</span>
                  <span>Simpan Karakter</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

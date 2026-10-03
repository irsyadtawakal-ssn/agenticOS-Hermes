export type DecorKind =
  // Plants
  | 'plant_monstera'
  | 'plant_snake'
  | 'plant_palm'
  | 'plant_ficus'
  | 'plant_potted'
  | 'plant_small'
  // Lamps
  | 'lamp_floor_round'
  | 'lamp_floor_square'
  | 'lamp_desk'
  // Seating
  | 'chair_desk'
  | 'chair_visitor'
  | 'sofa_lounge'
  | 'sofa_modern'
  | 'stool_bar'
  // Tables
  | 'table_bistro'
  | 'table_coffee_glass'
  | 'table_coffee_wood'
  // Utility
  | 'cooler'
  | 'vending'
  | 'trashbin'
  | 'coatrack'
  | 'printer';

export interface DecorCatalogEntry {
  kind: DecorKind;
  name: string;
  category: 'plants' | 'lighting' | 'seating' | 'tables' | 'utility';
  width: number;
  depth: number;
  height: number;
  icon: string;
  kenneyModel?: string;
}

export interface DecorItem {
  id: string;
  kind: DecorKind;
  x: number;
  z: number;
  rot: number; // rotation in radians (0, PI/2, PI, 3PI/2)
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const DECOR_CATALOG: Record<DecorKind, DecorCatalogEntry> = {
  // Plants
  plant_monstera: { kind: 'plant_monstera', name: 'Monstera Pot', category: 'plants', width: 0.6, depth: 0.6, height: 1.2, icon: '🌿' },
  plant_snake: { kind: 'plant_snake', name: 'Snake Plant', category: 'plants', width: 0.5, depth: 0.5, height: 0.9, icon: '🌱' },
  plant_palm: { kind: 'plant_palm', name: 'Areca Palm', category: 'plants', width: 0.6, depth: 0.6, height: 1.4, icon: '🌴' },
  plant_ficus: { kind: 'plant_ficus', name: 'Ficus Tree', category: 'plants', width: 0.6, depth: 0.6, height: 1.3, icon: '🪴' },
  plant_potted: { kind: 'plant_potted', name: 'Potted Plant', category: 'plants', width: 0.5, depth: 0.5, height: 1.1, icon: '🪴', kenneyModel: 'pottedPlant' },
  plant_small: { kind: 'plant_small', name: 'Desk Succulent', category: 'plants', width: 0.3, depth: 0.3, height: 0.35, icon: '🌵', kenneyModel: 'plantSmall1' },

  // Lighting
  lamp_floor_round: { kind: 'lamp_floor_round', name: 'Floor Lamp (Round)', category: 'lighting', width: 0.45, depth: 0.45, height: 1.7, icon: '🏮', kenneyModel: 'lampRoundFloor' },
  lamp_floor_square: { kind: 'lamp_floor_square', name: 'Floor Lamp (Square)', category: 'lighting', width: 0.45, depth: 0.45, height: 1.7, icon: '💡', kenneyModel: 'lampSquareFloor' },
  lamp_desk: { kind: 'lamp_desk', name: 'Desk Anglepoise', category: 'lighting', width: 0.35, depth: 0.35, height: 0.55, icon: '🛋' },

  // Seating
  chair_desk: { kind: 'chair_desk', name: 'Ergonomic Desk Chair', category: 'seating', width: 0.6, depth: 0.6, height: 0.95, icon: '💺', kenneyModel: 'chairDesk' },
  chair_visitor: { kind: 'chair_visitor', name: 'Executive Visitor Chair', category: 'seating', width: 0.6, depth: 0.6, height: 0.9, icon: '🪑', kenneyModel: 'chairDesk' },
  sofa_lounge: { kind: 'sofa_lounge', name: 'Lounge Sofa', category: 'seating', width: 1.8, depth: 0.8, height: 0.75, icon: '🛋', kenneyModel: 'loungeSofa' },
  sofa_modern: { kind: 'sofa_modern', name: 'Modern Reception Sofa', category: 'seating', width: 2.0, depth: 0.85, height: 0.75, icon: '🛋', kenneyModel: 'loungeDesignSofa' },
  stool_bar: { kind: 'stool_bar', name: 'Bar Stool', category: 'seating', width: 0.4, depth: 0.4, height: 0.55, icon: '🪵', kenneyModel: 'stoolBar' },

  // Tables
  table_bistro: { kind: 'table_bistro', name: 'Bistro Round Table', category: 'tables', width: 1.0, depth: 1.0, height: 0.75, icon: '🪙', kenneyModel: 'tableRound' },
  table_coffee_glass: { kind: 'table_coffee_glass', name: 'Glass Coffee Table', category: 'tables', width: 1.1, depth: 0.55, height: 0.42, icon: '🪟', kenneyModel: 'tableCoffeeGlass' },
  table_coffee_wood: { kind: 'table_coffee_wood', name: 'Wood Coffee Table', category: 'tables', width: 1.2, depth: 0.6, height: 0.42, icon: '🟫', kenneyModel: 'tableCoffee' },

  // Utility
  cooler: { kind: 'cooler', name: 'Water Cooler', category: 'utility', width: 0.5, depth: 0.5, height: 1.4, icon: '🚰' },
  vending: { kind: 'vending', name: 'Vending Machine', category: 'utility', width: 0.9, depth: 0.7, height: 1.85, icon: '🎰' },
  trashbin: { kind: 'trashbin', name: 'Office Trash Can', category: 'utility', width: 0.4, depth: 0.4, height: 0.45, icon: '🗑', kenneyModel: 'trashcan' },
  coatrack: { kind: 'coatrack', name: 'Standing Coat Rack', category: 'utility', width: 0.45, depth: 0.45, height: 1.75, icon: '🧥', kenneyModel: 'coatRackStanding' },
  printer: { kind: 'printer', name: 'Laser Office Printer', category: 'utility', width: 0.62, depth: 0.52, height: 0.5, icon: '🖨' },
};

export function decorBox(item: DecorItem): ObstacleBox {
  const entry = DECOR_CATALOG[item.kind];
  if (!entry) {
    return { minX: item.x - 0.25, maxX: item.x + 0.25, minZ: item.z - 0.25, maxZ: item.z + 0.25 };
  }
  // Check if rotated 90 or 270 degrees
  const isRotated = Math.abs(Math.sin(item.rot)) > 0.7;
  const w = isRotated ? entry.depth : entry.width;
  const d = isRotated ? entry.width : entry.depth;
  return {
    minX: item.x - w / 2,
    maxX: item.x + w / 2,
    minZ: item.z - d / 2,
    maxZ: item.z + d / 2,
  };
}

export const DEFAULT_DECOR: DecorItem[] = [
  // Reception Lobby
  { id: 'lobby_plant', kind: 'plant_palm', x: -2.5, z: -9.4, rot: 0 },
  { id: 'lobby_lamp', kind: 'lamp_floor_round', x: 2.0, z: -9.4, rot: 0 },
  { id: 'lobby_table', kind: 'table_coffee_glass', x: -0.5, z: -7.4, rot: 0 },

  // Chief Office
  { id: 'chief_sofa', kind: 'sofa_lounge', x: -9.8, z: -4.5, rot: Math.PI / 2 },
  { id: 'chief_lamp', kind: 'lamp_floor_square', x: -10.4, z: -2.9, rot: 0 },
  { id: 'chief_visitor1', kind: 'chair_visitor', x: -7.1, z: -5.6, rot: Math.PI },
  { id: 'chief_visitor2', kind: 'chair_visitor', x: -5.9, z: -5.6, rot: Math.PI },
  { id: 'chief_plant1', kind: 'plant_monstera', x: -10.0, z: -9.0, rot: 0 },
  { id: 'chief_plant2', kind: 'plant_snake', x: -4.9, z: -9.4, rot: 0 },

  // Workstation Area
  { id: 'ws_plant1', kind: 'plant_ficus', x: -10.4, z: 9.4, rot: 0 },
  { id: 'ws_plant2', kind: 'plant_snake', x: -10.4, z: 0.6, rot: 0 },
  { id: 'ws_plant3', kind: 'plant_ficus', x: 2.0, z: 0.6, rot: 0 },
  { id: 'ws_plant4', kind: 'plant_palm', x: -6.7, z: 9.4, rot: 0 },
  { id: 'ws_bin1', kind: 'trashbin', x: -9.4, z: 1.0, rot: 0 },
  { id: 'ws_bin2', kind: 'trashbin', x: 1.9, z: 2.4, rot: 0 },
  { id: 'ws_printer', kind: 'printer', x: 1.65, z: 9.5, rot: Math.PI },
  { id: 'ws_coatrack', kind: 'coatrack', x: -0.8, z: 9.4, rot: 0 },

  // Pantry
  { id: 'pantry_cooler', kind: 'cooler', x: 6.5, z: -8.8, rot: 0 },
  { id: 'pantry_vending', kind: 'vending', x: 3.3, z: -9.5, rot: 0 },
  { id: 'pantry_table', kind: 'table_bistro', x: 4.9, z: -5.6, rot: 0 },
  { id: 'pantry_stool1', kind: 'stool_bar', x: 4.3, z: -5.6, rot: 0 },
  { id: 'pantry_stool2', kind: 'stool_bar', x: 5.5, z: -5.6, rot: 0 },
  { id: 'pantry_coffee_table', kind: 'table_coffee_wood', x: 8.2, z: -4.2, rot: 0 },
  { id: 'pantry_plant', kind: 'plant_ficus', x: 10.3, z: -1.0, rot: 0 },

  // Meeting Room
  { id: 'meet_plant1', kind: 'plant_palm', x: 3.5, z: 8.8, rot: 0 },
  { id: 'meet_plant2', kind: 'plant_ficus', x: 10.4, z: 1.2, rot: 0 },
];

const LAYOUT_KEY = 'aos.sims.layout.v1';
const memStorage = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // fallback
  }
  return memStorage.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // fallback
  }
  memStorage.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    // fallback
  }
  memStorage.delete(key);
}

export function loadDecorLayout(): DecorItem[] {
  try {
    const raw = getStorageItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DecorItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_DECOR.map((d) => ({ ...d }));
}

export function saveDecorLayout(items: DecorItem[]): void {
  try {
    setStorageItem(LAYOUT_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function resetDecorLayout(): DecorItem[] {
  try {
    removeStorageItem(LAYOUT_KEY);
  } catch {
    // ignore
  }
  return DEFAULT_DECOR.map((d) => ({ ...d }));
}

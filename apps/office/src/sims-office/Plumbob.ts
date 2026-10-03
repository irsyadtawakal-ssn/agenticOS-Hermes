import * as THREE from 'three';

export type PlumbobColorState = 'ready' | 'working' | 'approval' | 'error' | 'offline';

const COLOR_MAP: Record<PlumbobColorState, number> = {
  ready: 0x33e633,    // Bright Sims emerald green
  working: 0x00c8ff,  // Cyan/Electric blue (active LLM / processing)
  approval: 0xffbb00, // Golden yellow / orange (waiting for user decision)
  error: 0xff2222,    // Urgent red (blocked / failure)
  offline: 0x778899,  // Muted gray
};

/**
 * Procedural 3D Plumbob crystal (The iconic double-pyramid diamond).
 */
export class Plumbob {
  public group: THREE.Group;
  private upperCone: THREE.Mesh;
  private lowerCone: THREE.Mesh;
  private innerGlow: THREE.PointLight;
  private material: THREE.MeshStandardMaterial;
  private baseHeight: number = 2.4; // Height above agent's head
  private timeOffset: number;

  constructor(initialState: PlumbobColorState = 'ready') {
    this.group = new THREE.Group();
    this.timeOffset = Math.random() * Math.PI * 2;

    const color = COLOR_MAP[initialState];

    // High quality faceted gem material with slight emissive glow
    this.material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });

    // 6-sided double cone for the classic faceted Sims 2 Plumbob diamond
    const radius = 0.22;
    const height = 0.45;
    const segments = 6;

    const upperGeo = new THREE.ConeGeometry(radius, height, segments);
    this.upperCone = new THREE.Mesh(upperGeo, this.material);
    this.upperCone.position.y = height / 2;

    const lowerGeo = new THREE.ConeGeometry(radius, height, segments);
    this.lowerCone = new THREE.Mesh(lowerGeo, this.material);
    this.lowerCone.rotation.x = Math.PI; // Flip upside down
    this.lowerCone.position.y = -height / 2;

    this.group.add(this.upperCone);
    this.group.add(this.lowerCone);

    // Inner subtle point light casting glow on character
    this.innerGlow = new THREE.PointLight(color, 0.8, 2.5);
    this.group.add(this.innerGlow);

    this.group.position.y = this.baseHeight;
  }

  public setState(state: PlumbobColorState): void {
    const color = COLOR_MAP[state];
    this.material.color.setHex(color);
    this.material.emissive.setHex(color);
    this.innerGlow.color.setHex(color);
  }

  public update(time: number, dt: number): void {
    // Continuous smooth rotation around Y axis
    this.group.rotation.y += dt * 2.2;

    // Gentle up-and-down floating bob
    const bob = Math.sin(time * 3.5 + this.timeOffset) * 0.06;
    this.group.position.y = this.baseHeight + bob;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public destroy(): void {
    this.upperCone.geometry.dispose();
    this.lowerCone.geometry.dispose();
    this.material.dispose();
  }
}

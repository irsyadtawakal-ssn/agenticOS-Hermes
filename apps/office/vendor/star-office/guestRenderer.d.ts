import type Phaser from 'phaser';
export interface Visitor { agentId: string; name: string; state: string; area: string; avatar: string }
export interface GuestView { sprite: Phaser.GameObjects.Sprite; nameText: Phaser.GameObjects.Text }
export function createGuestRenderer(scene: Phaser.Scene, visitors: () => Visitor[], point: (area: string, index: number, agent: Visitor) => { x: number; y: number }): { render(): void; sprites: Record<string, GuestView> };

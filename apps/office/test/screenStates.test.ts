import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ScreenManager } from '../src/sims-office/ScreenStates.ts';

describe('The Sims 2 Office: ScreenStates & Monitor Updates', () => {
  it('updates screen material emissive color based on agent state', () => {
    const sm = new ScreenManager();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
    });

    sm.registerScreen('dev', mat);

    // Initial state: idle
    expect(mat.emissive.getHex()).toBe(0x0369a1);

    // Transition to working -> glowing blue/cyan
    sm.setAgentState('dev', 'working', false);
    expect(mat.emissive.getHex()).toBe(0x0284c7);
    expect(mat.emissiveIntensity).toBeGreaterThan(0.7);

    // Transition to approval pending -> amber warning
    sm.setAgentState('dev', 'working', true);
    expect(mat.emissive.getHex()).toBe(0xf59e0b);

    // Transition to error -> red
    sm.setAgentState('dev', 'error', false);
    expect(mat.emissive.getHex()).toBe(0xef4444);

    // Transition to offline -> dark
    sm.setAgentState('dev', 'offline', false);
    expect(mat.emissive.getHex()).toBe(0x020408);
    expect(mat.emissiveIntensity).toBeLessThan(0.1);

    // Back to idle
    sm.setAgentState('dev', 'idle', false);
    expect(mat.emissive.getHex()).toBe(0x0369a1);

    sm.dispose();
  });

  it('pulses approval screens over time in update loop', () => {
    const sm = new ScreenManager();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.0,
    });

    sm.registerScreen('chief', mat);
    sm.setAgentState('chief', 'working', true); // approval active

    const intensity1 = mat.emissiveIntensity;
    sm.update(0.3);
    const intensity2 = mat.emissiveIntensity;

    expect(intensity1).not.toBe(intensity2);

    sm.dispose();
  });
});

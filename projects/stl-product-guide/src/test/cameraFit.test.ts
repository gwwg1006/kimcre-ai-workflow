import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  calculateCameraDistance,
  createPresetCameraState,
  applyCameraState,
} from '../lib/three/cameraFit';
import { ViewPreset } from '../types';

describe('Camera Fitting and Preset Utilities', () => {
  it('calculates finite camera distance based on radius', () => {
    const dist10 = calculateCameraDistance(10);
    const dist50 = calculateCameraDistance(50);

    expect(Number.isFinite(dist10)).toBe(true);
    expect(dist10).toBeGreaterThan(10);
    expect(dist50).toBeGreaterThan(dist10);
  });

  const presets: ViewPreset[] = [
    'iso-front-right',
    'iso-front-left',
    'iso-rear-right',
    'iso-rear-left',
    'front',
    'back',
    'right',
    'left',
    'top',
  ];

  presets.forEach((preset) => {
    it(`generates valid preset camera state for ${preset}`, () => {
      const state = createPresetCameraState(preset, 25, 4 / 3);

      expect(state.preset).toBe(preset);
      expect(state.position.length).toBe(3);
      expect(state.position.every(Number.isFinite)).toBe(true);
      expect(state.target).toEqual([0, 0, 0]);
      expect(state.up.length).toBe(3);
    });
  });

  it('correctly applies camera state to PerspectiveCamera', () => {
    const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 1000);
    const state = createPresetCameraState('isometric', 30);

    applyCameraState(camera, state, 30);

    expect(camera.position.x).toBeCloseTo(state.position[0], 1);
    expect(camera.position.y).toBeCloseTo(state.position[1], 1);
    expect(camera.position.z).toBeCloseTo(state.position[2], 1);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
  });
});

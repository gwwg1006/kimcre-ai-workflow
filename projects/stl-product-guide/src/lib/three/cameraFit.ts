import * as THREE from 'three';
import { CameraState, ViewPreset } from '../../types';
import { THREE_CONSTANTS } from './constants';

export interface PresetInfo {
  id: ViewPreset;
  label: string;
  category: '사선' | '정면/후면' | '측면/상단';
  description: string;
}

export const PRESET_OPTIONS: PresetInfo[] = [
  { id: 'iso-front-right', label: '앞-우측 사선', category: '사선', description: '기본 상품 대표 각도' },
  { id: 'iso-front-left', label: '앞-좌측 사선', category: '사선', description: '좌측면 강조 사선 각도' },
  { id: 'iso-rear-right', label: '뒤-우측 사선', category: '사선', description: '후면 우측 사선 각도' },
  { id: 'iso-rear-left', label: '뒤-좌측 사선', category: '사선', description: '후면 좌측 사선 각도' },
  { id: 'front', label: '정면 뷰', category: '정면/후면', description: '앞면 수직 뷰' },
  { id: 'back', label: '후면 뷰', category: '정면/후면', description: '뒷면 수직 뷰' },
  { id: 'right', label: '우측면 뷰', category: '측면/상단', description: '오른쪽 수직 뷰' },
  { id: 'left', label: '좌측면 뷰', category: '측면/상단', description: '왼쪽 수직 뷰' },
  { id: 'top', label: '상단 탑뷰', category: '측면/상단', description: '위에서 내려다보는 평면 뷰' },
];

export function calculateCameraDistance(
  radius: number,
  fov: number = THREE_CONSTANTS.FOV,
  aspect = 4 / 3,
  fitRatio = THREE_CONSTANTS.FIT_RATIO
): number {
  const fovRad = (fov * Math.PI) / 180;
  const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
  const minFovRad = Math.min(fovRad, hFovRad);

  const distance = radius / (Math.sin(minFovRad / 2) * fitRatio);
  return Math.max(distance, 1);
}

/**
 * Standard Y-Up preset directions for clean turntable alignment.
 */
export function getPresetDirection(preset: ViewPreset): { dir: THREE.Vector3; up: THREE.Vector3 } {
  switch (preset) {
    case 'iso-front-right':
    case 'isometric': {
      const dir = new THREE.Vector3(1, 0.85, 1.2).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'iso-front-left': {
      const dir = new THREE.Vector3(-1, 0.85, 1.2).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'iso-rear-right': {
      const dir = new THREE.Vector3(1, 0.85, -1.2).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'iso-rear-left': {
      const dir = new THREE.Vector3(-1, 0.85, -1.2).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'front': {
      const dir = new THREE.Vector3(0, 0, 1).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'back': {
      const dir = new THREE.Vector3(0, 0, -1).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'right': {
      const dir = new THREE.Vector3(1, 0, 0).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'left': {
      const dir = new THREE.Vector3(-1, 0, 0).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
    case 'top': {
      const dir = new THREE.Vector3(0, 1, 0.0001).normalize();
      return { dir, up: new THREE.Vector3(0, 0, -1) };
    }
    case 'custom':
    default: {
      const dir = new THREE.Vector3(1, 0.85, 1.2).normalize();
      return { dir, up: new THREE.Vector3(0, 1, 0) };
    }
  }
}

export function createPresetCameraState(
  preset: ViewPreset,
  boundingSphereRadius: number,
  aspect = 4 / 3
): CameraState {
  const distance = calculateCameraDistance(boundingSphereRadius, THREE_CONSTANTS.FOV, aspect);
  const { dir, up } = getPresetDirection(preset);
  const position: [number, number, number] = [
    Number((dir.x * distance).toFixed(3)),
    Number((dir.y * distance).toFixed(3)),
    Number((dir.z * distance).toFixed(3)),
  ];

  return {
    position,
    target: [0, 0, 0],
    up: [up.x, up.y, up.z],
    zoom: 1,
    preset,
  };
}

export function applyCameraState(
  camera: THREE.PerspectiveCamera,
  state: CameraState,
  boundingSphereRadius?: number
): void {
  camera.position.set(state.position[0], state.position[1], state.position[2]);
  camera.up.set(state.up[0], state.up[1], state.up[2]);
  camera.lookAt(state.target[0], state.target[1], state.target[2]);
  camera.zoom = state.zoom || 1;

  if (boundingSphereRadius && boundingSphereRadius > 0) {
    const dist = camera.position.distanceTo(new THREE.Vector3(...state.target));
    camera.near = Math.max(0.1, dist - boundingSphereRadius * 3);
    camera.far = dist + boundingSphereRadius * 10;
  }
  camera.updateProjectionMatrix();
}

import * as THREE from 'three';
import { CameraState, ViewPreset } from '../../types';
import { THREE_CONSTANTS } from './constants';
import { applyCameraState, createPresetCameraState, PRESET_OPTIONS } from './cameraFit';

export type ShadingStyle = 'technical' | 'clay' | 'metallic';

class OffscreenThumbnailRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private previewRenderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mainLight: THREE.DirectionalLight;
  private material: THREE.MeshStandardMaterial;
  private lineMaterial: THREE.LineBasicMaterial;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THREE_CONSTANTS.BACKGROUND_COLOR);

    // 1. Ambient Light
    const ambientLight = new THREE.AmbientLight(
      THREE_CONSTANTS.AMBIENT_LIGHT_COLOR,
      THREE_CONSTANTS.AMBIENT_LIGHT_INTENSITY
    );
    this.scene.add(ambientLight);

    // 2. Key Light
    this.mainLight = new THREE.DirectionalLight(
      THREE_CONSTANTS.MAIN_LIGHT_COLOR,
      THREE_CONSTANTS.MAIN_LIGHT_INTENSITY
    );
    this.mainLight.position.set(500, 800, 600);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.width = 2048;
    this.mainLight.shadow.mapSize.height = 2048;
    this.mainLight.shadow.bias = -0.0005;
    this.scene.add(this.mainLight);

    // 3. Fill Light
    const fillLight = new THREE.DirectionalLight(
      THREE_CONSTANTS.FILL_LIGHT_COLOR,
      THREE_CONSTANTS.FILL_LIGHT_INTENSITY
    );
    fillLight.position.set(-500, -200, -400);
    this.scene.add(fillLight);

    // 4. Rim Back Light
    const rimLight = new THREE.DirectionalLight(
      THREE_CONSTANTS.RIM_LIGHT_COLOR,
      THREE_CONSTANTS.RIM_LIGHT_INTENSITY
    );
    rimLight.position.set(0, -600, -800);
    this.scene.add(rimLight);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      THREE_CONSTANTS.FOV,
      THREE_CONSTANTS.CAPTURE_WIDTH / THREE_CONSTANTS.CAPTURE_HEIGHT,
      0.1,
      5000
    );
    this.camera.up.set(0, 1, 0);

    // Standard material with shadow support
    this.material = new THREE.MeshStandardMaterial({
      color: THREE_CONSTANTS.MODEL_COLOR,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0x334155,
      linewidth: 1,
    });
  }

  private initRenderer(): THREE.WebGLRenderer {
    if (!this.renderer) {
      const canvas = document.createElement('canvas');
      canvas.width = THREE_CONSTANTS.CAPTURE_WIDTH;
      canvas.height = THREE_CONSTANTS.CAPTURE_HEIGHT;

      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false,
      });
      this.renderer.setSize(THREE_CONSTANTS.CAPTURE_WIDTH, THREE_CONSTANTS.CAPTURE_HEIGHT);
      this.renderer.setClearColor(THREE_CONSTANTS.BACKGROUND_COLOR, 1);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    return this.renderer;
  }

  private initPreviewRenderer(): THREE.WebGLRenderer {
    if (!this.previewRenderer) {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 180;

      this.previewRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false,
      });
      this.previewRenderer.setSize(240, 180);
      this.previewRenderer.setClearColor(THREE_CONSTANTS.BACKGROUND_COLOR, 1);
      this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.previewRenderer.toneMappingExposure = 1.05;
      this.previewRenderer.shadowMap.enabled = true;
      this.previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    return this.previewRenderer;
  }

  public applyShading(mode: ShadingStyle = 'technical', colorHex: number = 0xdde3eb) {
    this.material.color.setHex(colorHex);

    switch (mode) {
      case 'clay':
        this.material.roughness = 0.85;
        this.material.metalness = 0.0;
        break;
      case 'technical':
        this.material.roughness = 0.55;
        this.material.metalness = 0.05;
        break;
      case 'metallic':
        this.material.roughness = 0.28;
        this.material.metalness = 0.5;
        break;
    }
  }

  public async capturePNG(
    geometry: THREE.BufferGeometry,
    cameraState: CameraState,
    radius: number,
    showEdges: boolean = true,
    shading: ShadingStyle = 'technical',
    colorHex: number = 0xdde3eb
  ): Promise<Blob> {
    const renderer = this.initRenderer();
    this.applyShading(shading, colorHex);

    const shadowD = radius * 2.5;
    this.mainLight.shadow.camera.left = -shadowD;
    this.mainLight.shadow.camera.right = shadowD;
    this.mainLight.shadow.camera.top = shadowD;
    this.mainLight.shadow.camera.bottom = -shadowD;
    this.mainLight.shadow.camera.near = 10;
    this.mainLight.shadow.camera.far = radius * 10;
    this.mainLight.shadow.camera.updateProjectionMatrix();

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    let edgesGeom: THREE.EdgesGeometry | null = null;
    let lineSegments: THREE.LineSegments | null = null;

    if (showEdges) {
      edgesGeom = new THREE.EdgesGeometry(geometry, THREE_CONSTANTS.EDGE_THRESHOLD_ANGLE);
      lineSegments = new THREE.LineSegments(edgesGeom, this.lineMaterial);
      group.add(lineSegments);
    }

    this.scene.add(group);

    applyCameraState(this.camera, cameraState, radius);
    renderer.render(this.scene, this.camera);

    this.scene.remove(group);
    if (edgesGeom) edgesGeom.dispose();

    return new Promise<Blob>((resolve, reject) => {
      renderer.domElement.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('RENDER_FAILED'));
          }
        },
        'image/png',
        1.0
      );
    });
  }

  public capturePresetThumbnailsBatch(
    geometry: THREE.BufferGeometry,
    radius: number,
    showEdges: boolean = true,
    shading: ShadingStyle = 'technical',
    colorHex: number = 0xdde3eb
  ): Record<ViewPreset, string> {
    const renderer = this.initPreviewRenderer();
    this.applyShading(shading, colorHex);

    const shadowD = radius * 2.5;
    this.mainLight.shadow.camera.left = -shadowD;
    this.mainLight.shadow.camera.right = shadowD;
    this.mainLight.shadow.camera.top = shadowD;
    this.mainLight.shadow.camera.bottom = -shadowD;
    this.mainLight.shadow.camera.near = 10;
    this.mainLight.shadow.camera.far = radius * 10;
    this.mainLight.shadow.camera.updateProjectionMatrix();

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    let edgesGeom: THREE.EdgesGeometry | null = null;
    let lineSegments: THREE.LineSegments | null = null;

    if (showEdges) {
      edgesGeom = new THREE.EdgesGeometry(geometry, THREE_CONSTANTS.EDGE_THRESHOLD_ANGLE);
      lineSegments = new THREE.LineSegments(edgesGeom, this.lineMaterial);
      group.add(lineSegments);
    }

    this.scene.add(group);

    const results: Partial<Record<ViewPreset, string>> = {};

    for (const opt of PRESET_OPTIONS) {
      const camState = createPresetCameraState(opt.id, radius, 240 / 180);
      applyCameraState(this.camera, camState, radius);
      renderer.render(this.scene, this.camera);
      results[opt.id] = renderer.domElement.toDataURL('image/jpeg', 0.85);
    }

    this.scene.remove(group);
    if (edgesGeom) edgesGeom.dispose();

    return results as Record<ViewPreset, string>;
  }

  public dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer.forceContextLoss();
      this.previewRenderer = null;
    }
    this.material.dispose();
    this.lineMaterial.dispose();
  }
}

export const captureEngine = new OffscreenThumbnailRenderer();

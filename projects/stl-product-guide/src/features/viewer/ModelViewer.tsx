import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useProjectStore } from '../../store/projectStore';
import { ViewPreset, CameraState, COLOR_PALETTE } from '../../types';
import { getBlob, saveBlob, deleteBlob } from '../../lib/persistence/db';
import { parseModelFile } from '../../lib/model/modelParser';
import { THREE_CONSTANTS } from '../../lib/three/constants';
import {
  createPresetCameraState,
  applyCameraState,
  PRESET_OPTIONS,
} from '../../lib/three/cameraFit';
import { captureEngine, ShadingStyle } from '../../lib/three/captureEngine';
import {
  RotateCw,
  Check,
  AlertTriangle,
  Eye,
  Loader2,
  Maximize2,
  Layers,
  Sparkles,
  Camera,
  Compass,
  Palette,
  SquareDashedKanban,
  CheckCheck,
} from 'lucide-react';

export const ModelViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedItemId = useProjectStore((state) => state.project.selectedItemId);
  const items = useProjectStore((state) => state.project.items);
  const globalShadingMode = useProjectStore((state) => state.project.globalShadingMode || 'technical');
  const globalColorHex = useProjectStore((state) => state.project.globalColorHex || 0xdde3eb);
  const globalShowEdges = useProjectStore((state) => state.project.globalShowEdges !== false);
  const selectedItem = useProjectStore((state) =>
    state.project.items.find((item) => item.id === state.project.selectedItemId)
  );
  const projectId = useProjectStore((state) => state.project.id);
  const setThumbnail = useProjectStore((state) => state.setThumbnail);
  const batchUpdateThumbnails = useProjectStore((state) => state.batchUpdateThumbnails);
  const updateProjectMeta = useProjectStore((state) => state.updateProjectMeta);

  const [loadingModel, setLoadingModel] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [applyAllSuccess, setApplyAllSuccess] = useState(false);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [applyAllProgress, setApplyAllProgress] = useState({ current: 0, total: 0 });
  const [activePreset, setActivePreset] = useState<ViewPreset>('iso-front-right');
  const [presetThumbnails, setPresetThumbnails] = useState<Record<string, string>>({});
  const [turntableAngle, setTurntableAngle] = useState<number>(40);
  const [showEdges, setShowEdges] = useState<boolean>(globalShowEdges);
  const [shadingMode, setShadingMode] = useState<ShadingStyle>(globalShadingMode);
  const [selectedColorHex, setSelectedColorHex] = useState<number>(globalColorHex);

  // Three.js instances ref
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    mainLight: THREE.DirectionalLight;
    modelGroup: THREE.Group | null;
    currentMesh: THREE.Mesh | null;
    lineSegments: THREE.LineSegments | null;
    geometry: THREE.BufferGeometry | null;
    material: THREE.MeshStandardMaterial;
    lineMaterial: THREE.LineBasicMaterial;
    radius: number;
    reqId: number | null;
  } | null>(null);

  // Helper to calculate current azimuth angle (0~360 deg) from camera position
  const getCameraAzimuthDeg = useCallback((camera: THREE.PerspectiveCamera, target: THREE.Vector3) => {
    const dx = camera.position.x - target.x;
    const dz = camera.position.z - target.z;
    const rad = Math.atan2(dx, dz);
    let deg = Math.round((rad * 180) / Math.PI);
    if (deg < 0) deg += 360;
    return deg % 360;
  }, []);

  // Helper to apply material style and color
  const applyMaterialProperties = useCallback(
    (mat: THREE.MeshStandardMaterial, mode: ShadingStyle, colorHex: number) => {
      mat.color.setHex(colorHex);
      switch (mode) {
        case 'clay':
          mat.roughness = 0.85;
          mat.metalness = 0.0;
          break;
        case 'technical':
          mat.roughness = 0.55;
          mat.metalness = 0.05;
          break;
        case 'metallic':
          mat.roughness = 0.28;
          mat.metalness = 0.5;
          break;
      }
      mat.needsUpdate = true;
    },
    []
  );

  // Initialize Three.js Scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.clientWidth || 500;
    const height = canvas.clientHeight || 300;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THREE_CONSTANTS.BACKGROUND_COLOR);

    // 1. Ambient Light
    const ambientLight = new THREE.AmbientLight(
      THREE_CONSTANTS.AMBIENT_LIGHT_COLOR,
      THREE_CONSTANTS.AMBIENT_LIGHT_INTENSITY
    );
    scene.add(ambientLight);

    // 2. Key Directional Light with Contact Shadow Map
    const mainLight = new THREE.DirectionalLight(
      THREE_CONSTANTS.MAIN_LIGHT_COLOR,
      THREE_CONSTANTS.MAIN_LIGHT_INTENSITY
    );
    mainLight.position.set(500, 800, 600);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0005;
    scene.add(mainLight);

    // 3. Fill Light
    const fillLight = new THREE.DirectionalLight(
      THREE_CONSTANTS.FILL_LIGHT_COLOR,
      THREE_CONSTANTS.FILL_LIGHT_INTENSITY
    );
    fillLight.position.set(-500, -200, -400);
    scene.add(fillLight);

    // 4. Rim Back Light
    const rimLight = new THREE.DirectionalLight(
      THREE_CONSTANTS.RIM_LIGHT_COLOR,
      THREE_CONSTANTS.RIM_LIGHT_INTENSITY
    );
    rimLight.position.set(0, -600, -800);
    scene.add(rimLight);

    // Camera in standard Y-Up
    const camera = new THREE.PerspectiveCamera(THREE_CONSTANTS.FOV, width / height, 0.1, 5000);
    camera.up.set(0, 1, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 1.5;
    controls.zoomSpeed = 1.3;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI - 0.05;
    controls.minPolarAngle = 0.05;
    controls.target.set(0, 0, 0);

    controls.addEventListener('start', () => {
      setActivePreset('custom');
    });

    controls.addEventListener('change', () => {
      const deg = getCameraAzimuthDeg(camera, controls.target);
      setTurntableAngle(deg);
    });

    const material = new THREE.MeshStandardMaterial({
      color: globalColorHex,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x334155,
      linewidth: 1,
    });

    const state = {
      renderer,
      scene,
      camera,
      controls,
      mainLight,
      modelGroup: null as THREE.Group | null,
      currentMesh: null as THREE.Mesh | null,
      lineSegments: null as THREE.LineSegments | null,
      geometry: null as THREE.BufferGeometry | null,
      material,
      lineMaterial,
      radius: 50,
      reqId: null as number | null,
    };
    threeRef.current = state;

    let isRunning = true;
    const animate = () => {
      if (!isRunning) return;
      state.controls.update();
      state.renderer.render(state.scene, state.camera);
      state.reqId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !threeRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      state.camera.aspect = w / h;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w, h, false);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      isRunning = false;
      if (state.reqId) cancelAnimationFrame(state.reqId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      material.dispose();
      lineMaterial.dispose();
      threeRef.current = null;
    };
  }, [getCameraAzimuthDeg]);

  // Synchronize when selected item identity changes (Loads 3D geometry once)
  useEffect(() => {
    if (!selectedItem || selectedItem.status !== 'ready') {
      if (threeRef.current?.modelGroup) {
        threeRef.current.scene.remove(threeRef.current.modelGroup);
        threeRef.current.modelGroup = null;
        threeRef.current.currentMesh = null;
        threeRef.current.lineSegments = null;
      }
      setPresetThumbnails({});
      return;
    }

    let isMounted = true;
    setLoadingModel(true);
    setLoadError(null);

    const targetPreset = selectedItem.camera.preset || 'iso-front-right';
    const targetShading = selectedItem.shadingMode || globalShadingMode;
    const targetColor = selectedItem.colorHex || globalColorHex;
    const targetEdges = selectedItem.showEdges !== undefined ? selectedItem.showEdges : globalShowEdges;

    setActivePreset(targetPreset);
    setShadingMode(targetShading);
    setSelectedColorHex(targetColor);
    setShowEdges(targetEdges);

    (async () => {
      try {
        const blob = await getBlob(selectedItem.blobId);
        if (!blob) throw new Error('원본 3D 모델 파일을 찾을 수 없습니다.');

        const arrayBuffer = await blob.arrayBuffer();
        const parsedModels = await parseModelFile(
          arrayBuffer,
          selectedItem.source.name,
          selectedItem.splitChoice || 'split-objects'
        );

        const partIdx = (selectedItem.partIndex || selectedItem.plateIndex || 1) - 1;
        const targetModel = parsedModels[partIdx] || parsedModels[0];

        if (!targetModel) {
          throw new Error('EMPTY_GEOMETRY');
        }

        const { geometry, boundingSphereRadius } = targetModel;

        if (!isMounted || !threeRef.current) {
          geometry.dispose();
          return;
        }

        const { scene, camera, controls, mainLight, material, lineMaterial } = threeRef.current;

        // Apply item's shading & color
        applyMaterialProperties(material, targetShading, targetColor);

        // Adjust shadow camera bounds
        const shadowD = boundingSphereRadius * 2.5;
        mainLight.shadow.camera.left = -shadowD;
        mainLight.shadow.camera.right = shadowD;
        mainLight.shadow.camera.top = shadowD;
        mainLight.shadow.camera.bottom = -shadowD;
        mainLight.shadow.camera.near = 10;
        mainLight.shadow.camera.far = boundingSphereRadius * 10;
        mainLight.shadow.camera.updateProjectionMatrix();

        if (threeRef.current.modelGroup) {
          scene.remove(threeRef.current.modelGroup);
          threeRef.current.modelGroup = null;
        }

        const group = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        const edgesGeom = new THREE.EdgesGeometry(geometry, THREE_CONSTANTS.EDGE_THRESHOLD_ANGLE);
        const lineSegments = new THREE.LineSegments(edgesGeom, lineMaterial);
        lineSegments.visible = targetEdges;
        group.add(lineSegments);

        scene.add(group);

        threeRef.current.modelGroup = group;
        threeRef.current.currentMesh = mesh;
        threeRef.current.lineSegments = lineSegments;
        threeRef.current.geometry = geometry;
        threeRef.current.radius = boundingSphereRadius;

        // Generate 9-angle actual rendered thumbnails with matching color & shading
        const batchThumbnails = captureEngine.capturePresetThumbnailsBatch(
          geometry,
          boundingSphereRadius,
          targetEdges,
          targetShading,
          targetColor
        );
        if (isMounted) {
          setPresetThumbnails(batchThumbnails);
        }

        // Apply camera
        controls.target.set(
          selectedItem.camera.target[0],
          selectedItem.camera.target[1],
          selectedItem.camera.target[2]
        );
        applyCameraState(camera, selectedItem.camera, boundingSphereRadius);
        controls.update();

        const initialAngle = getCameraAzimuthDeg(camera, controls.target);
        setTurntableAngle(initialAngle);

        setLoadingModel(false);
      } catch (err: unknown) {
        if (!isMounted) return;
        setLoadingModel(false);
        setLoadError(err instanceof Error ? err.message : '모델 로드 실패');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [
    selectedItem?.id,
    selectedItem?.blobId,
    selectedItem?.partIndex,
    selectedItem?.plateIndex,
    selectedItem?.splitChoice,
    selectedItem?.status,
    getCameraAzimuthDeg,
    applyMaterialProperties,
  ]);

  // Click on a preset thumbnail
  const handleSelectPreset = useCallback(
    async (preset: ViewPreset) => {
      if (!threeRef.current || !selectedItem || !threeRef.current.geometry) return;

      const { camera, controls, radius, geometry } = threeRef.current;
      const newState = createPresetCameraState(preset, radius, camera.aspect);

      controls.target.set(newState.target[0], newState.target[1], newState.target[2]);
      applyCameraState(camera, newState, radius);
      controls.update();
      setActivePreset(preset);

      const deg = getCameraAzimuthDeg(camera, controls.target);
      setTurntableAngle(deg);

      try {
        const thumbnailBlob = await captureEngine.capturePNG(
          geometry,
          newState,
          radius,
          showEdges,
          shadingMode,
          selectedColorHex
        );
        const oldThumbnailId = selectedItem.thumbnailBlobId;
        const newThumbnailBlobId = crypto.randomUUID();

        await saveBlob(newThumbnailBlobId, projectId, selectedItem.id, 'thumbnail', thumbnailBlob);
        if (oldThumbnailId) {
          await deleteBlob(oldThumbnailId);
        }

        setThumbnail(selectedItem.id, newThumbnailBlobId, newState, shadingMode, showEdges, selectedColorHex);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 1500);
      } catch (e) {
        console.error('Failed to auto-apply thumbnail', e);
      }
    },
    [selectedItem, projectId, setThumbnail, getCameraAzimuthDeg, showEdges, shadingMode, selectedColorHex]
  );

  // Toggle Shading Mode (CAD / Clay / Metallic)
  const handleShadingChange = async (mode: ShadingStyle) => {
    setShadingMode(mode);
    updateProjectMeta({ globalShadingMode: mode });

    if (!threeRef.current) return;
    const { material, currentMesh, geometry, radius, camera, controls } = threeRef.current;
    
    // Instantly update material properties
    applyMaterialProperties(material, mode, selectedColorHex);
    if (currentMesh && currentMesh.material instanceof THREE.MeshStandardMaterial) {
      applyMaterialProperties(currentMesh.material, mode, selectedColorHex);
    }

    if (geometry && radius) {
      const batchThumbnails = captureEngine.capturePresetThumbnailsBatch(
        geometry,
        radius,
        showEdges,
        mode,
        selectedColorHex
      );
      setPresetThumbnails(batchThumbnails);

      if (selectedItem) {
        try {
          const currentCameraState: CameraState = {
            position: [
              Number(camera.position.x.toFixed(3)),
              Number(camera.position.y.toFixed(3)),
              Number(camera.position.z.toFixed(3)),
            ],
            target: [
              Number(controls.target.x.toFixed(3)),
              Number(controls.target.y.toFixed(3)),
              Number(controls.target.z.toFixed(3)),
            ],
            up: [
              Number(camera.up.x.toFixed(3)),
              Number(camera.up.y.toFixed(3)),
              Number(camera.up.z.toFixed(3)),
            ],
            zoom: camera.zoom,
            preset: activePreset,
          };

          const thumbnailBlob = await captureEngine.capturePNG(
            geometry,
            currentCameraState,
            radius,
            showEdges,
            mode,
            selectedColorHex
          );

          const oldThumbnailId = selectedItem.thumbnailBlobId;
          const newThumbnailBlobId = crypto.randomUUID();

          await saveBlob(newThumbnailBlobId, projectId, selectedItem.id, 'thumbnail', thumbnailBlob);
          if (oldThumbnailId) {
            await deleteBlob(oldThumbnailId);
          }

          setThumbnail(selectedItem.id, newThumbnailBlobId, currentCameraState, mode, showEdges, selectedColorHex);
        } catch (e) {
          console.error('Failed to sync shading to thumbnail', e);
        }
      }
    }
  };

  // Change Color (One-click Instant Update)
  const handleColorChange = async (colorHex: number) => {
    setSelectedColorHex(colorHex);
    updateProjectMeta({ globalColorHex: colorHex });

    if (!threeRef.current) return;
    const { material, currentMesh, geometry, radius, camera, controls } = threeRef.current;
    
    // 1. Instantly update 3D main canvas mesh material
    applyMaterialProperties(material, shadingMode, colorHex);
    if (currentMesh && currentMesh.material instanceof THREE.MeshStandardMaterial) {
      applyMaterialProperties(currentMesh.material, shadingMode, colorHex);
    }

    // 2. Instantly update 9-preset preview thumbnails
    if (geometry && radius) {
      const batchThumbnails = captureEngine.capturePresetThumbnailsBatch(
        geometry,
        radius,
        showEdges,
        shadingMode,
        colorHex
      );
      setPresetThumbnails(batchThumbnails);

      // 3. Update active card & print thumbnail
      if (selectedItem) {
        try {
          const currentCameraState: CameraState = {
            position: [
              Number(camera.position.x.toFixed(3)),
              Number(camera.position.y.toFixed(3)),
              Number(camera.position.z.toFixed(3)),
            ],
            target: [
              Number(controls.target.x.toFixed(3)),
              Number(controls.target.y.toFixed(3)),
              Number(controls.target.z.toFixed(3)),
            ],
            up: [
              Number(camera.up.x.toFixed(3)),
              Number(camera.up.y.toFixed(3)),
              Number(camera.up.z.toFixed(3)),
            ],
            zoom: camera.zoom,
            preset: activePreset,
          };

          const thumbnailBlob = await captureEngine.capturePNG(
            geometry,
            currentCameraState,
            radius,
            showEdges,
            shadingMode,
            colorHex
          );

          const oldThumbnailId = selectedItem.thumbnailBlobId;
          const newThumbnailBlobId = crypto.randomUUID();

          await saveBlob(newThumbnailBlobId, projectId, selectedItem.id, 'thumbnail', thumbnailBlob);
          if (oldThumbnailId) {
            await deleteBlob(oldThumbnailId);
          }

          setThumbnail(selectedItem.id, newThumbnailBlobId, currentCameraState, shadingMode, showEdges, colorHex);
        } catch (e) {
          console.error('Failed to sync color to thumbnail', e);
        }
      }
    }
  };

  // Toggle Edges Outline
  const handleToggleEdges = async () => {
    const next = !showEdges;
    setShowEdges(next);
    updateProjectMeta({ globalShowEdges: next });

    if (threeRef.current?.lineSegments) {
      threeRef.current.lineSegments.visible = next;
    }

    if (threeRef.current?.geometry && threeRef.current.radius && selectedItem) {
      const { geometry, radius, camera, controls } = threeRef.current;
      const batchThumbnails = captureEngine.capturePresetThumbnailsBatch(
        geometry,
        radius,
        next,
        shadingMode,
        selectedColorHex
      );
      setPresetThumbnails(batchThumbnails);

      try {
        const currentCameraState: CameraState = {
          position: [
            Number(camera.position.x.toFixed(3)),
            Number(camera.position.y.toFixed(3)),
            Number(camera.position.z.toFixed(3)),
          ],
          target: [
            Number(controls.target.x.toFixed(3)),
            Number(controls.target.y.toFixed(3)),
            Number(controls.target.z.toFixed(3)),
          ],
          up: [
            Number(camera.up.x.toFixed(3)),
            Number(camera.up.y.toFixed(3)),
            Number(camera.up.z.toFixed(3)),
          ],
          zoom: camera.zoom,
          preset: activePreset,
        };

        const thumbnailBlob = await captureEngine.capturePNG(
          geometry,
          currentCameraState,
          radius,
          next,
          shadingMode,
          selectedColorHex
        );

        const oldThumbnailId = selectedItem.thumbnailBlobId;
        const newThumbnailBlobId = crypto.randomUUID();

        await saveBlob(newThumbnailBlobId, projectId, selectedItem.id, 'thumbnail', thumbnailBlob);
        if (oldThumbnailId) {
          await deleteBlob(oldThumbnailId);
        }

        setThumbnail(selectedItem.id, newThumbnailBlobId, currentCameraState, shadingMode, next, selectedColorHex);
      } catch (e) {
        console.error('Failed to sync edge to thumbnail', e);
      }
    }
  };

  // Set turntable angle from slider
  const handleSliderChange = (newDeg: number) => {
    if (!threeRef.current) return;
    const { camera, controls } = threeRef.current;

    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const horizontalDist = Math.max(Math.sqrt(dx * dx + dz * dz), 1);
    const rad = (newDeg * Math.PI) / 180;

    camera.position.x = controls.target.x + horizontalDist * Math.sin(rad);
    camera.position.z = controls.target.z + horizontalDist * Math.cos(rad);
    camera.lookAt(controls.target);
    controls.update();

    setTurntableAngle(newDeg);
    setActivePreset('custom');
  };

  // Manual save for current view
  const handleSaveCurrentView = async () => {
    if (!threeRef.current || !selectedItem || !threeRef.current.geometry) return;

    try {
      const { camera, controls, geometry, radius } = threeRef.current;

      const currentCameraState: CameraState = {
        position: [
          Number(camera.position.x.toFixed(3)),
          Number(camera.position.y.toFixed(3)),
          Number(camera.position.z.toFixed(3)),
        ],
        target: [
          Number(controls.target.x.toFixed(3)),
          Number(controls.target.y.toFixed(3)),
          Number(controls.target.z.toFixed(3)),
        ],
        up: [
          Number(camera.up.x.toFixed(3)),
          Number(camera.up.y.toFixed(3)),
          Number(camera.up.z.toFixed(3)),
        ],
        zoom: camera.zoom,
        preset: activePreset,
      };

      const thumbnailBlob = await captureEngine.capturePNG(
        geometry,
        currentCameraState,
        radius,
        showEdges,
        shadingMode,
        selectedColorHex
      );

      const oldThumbnailId = selectedItem.thumbnailBlobId;
      const newThumbnailBlobId = crypto.randomUUID();

      await saveBlob(newThumbnailBlobId, projectId, selectedItem.id, 'thumbnail', thumbnailBlob);

      if (oldThumbnailId) {
        await deleteBlob(oldThumbnailId);
      }

      setThumbnail(selectedItem.id, newThumbnailBlobId, currentCameraState, shadingMode, showEdges, selectedColorHex);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to capture view', err);
      alert('썸네일 저장에 실패했습니다.');
    }
  };

  // Batch Apply to ALL Products (Camera + Shading + Color + Edges)
  const handleApplyToAll = async () => {
    if (!threeRef.current || items.length === 0) return;

    const { camera, controls } = threeRef.current;
    const currentPreset = activePreset;
    const currentShading = shadingMode;
    const currentColor = selectedColorHex;
    const currentEdges = showEdges;

    const targetVec = new THREE.Vector3(controls.target.x, controls.target.y, controls.target.z);
    const camPosVec = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
    const dir = new THREE.Vector3().subVectors(camPosVec, targetVec).normalize();
    const upVec: [number, number, number] = [
      Number(camera.up.x.toFixed(3)),
      Number(camera.up.y.toFixed(3)),
      Number(camera.up.z.toFixed(3)),
    ];

    setIsApplyingAll(true);
    const readyItems = items.filter((i) => i.status === 'ready');
    setApplyAllProgress({ current: 0, total: readyItems.length });

    updateProjectMeta({
      globalShadingMode: currentShading,
      globalColorHex: currentColor,
      globalShowEdges: currentEdges,
    });

    const updates: {
      id: string;
      thumbnailBlobId: string;
      camera: CameraState;
      shadingMode?: ShadingStyle;
      showEdges?: boolean;
      colorHex?: number;
    }[] = [];

    try {
      for (let i = 0; i < readyItems.length; i++) {
        const item = readyItems[i];
        setApplyAllProgress({ current: i + 1, total: readyItems.length });

        try {
          const blob = await getBlob(item.blobId);
          if (!blob) continue;

          const arrayBuffer = await blob.arrayBuffer();
          const parsedModels = await parseModelFile(
            arrayBuffer,
            item.source.name,
            item.splitChoice || 'split-objects'
          );
          const partIdx = (item.partIndex || item.plateIndex || 1) - 1;
          const targetModel = parsedModels[partIdx] || parsedModels[0];

          if (!targetModel) continue;

          const { geometry, boundingSphereRadius } = targetModel;

          let targetCameraState: CameraState;

          if (currentPreset && currentPreset !== 'custom') {
            targetCameraState = createPresetCameraState(currentPreset, boundingSphereRadius, 240 / 180);
          } else {
            const dist = (boundingSphereRadius * 2.2) / Math.sin(((THREE_CONSTANTS.FOV / 2) * Math.PI) / 180);
            targetCameraState = {
              position: [
                Number((dir.x * dist).toFixed(3)),
                Number((dir.y * dist).toFixed(3)),
                Number((dir.z * dist).toFixed(3)),
              ],
              target: [0, 0, 0],
              up: upVec,
              zoom: 1,
              preset: 'custom',
            };
          }

          const thumbnailBlob = await captureEngine.capturePNG(
            geometry,
            targetCameraState,
            boundingSphereRadius,
            currentEdges,
            currentShading,
            currentColor
          );

          const oldThumbnailId = item.thumbnailBlobId;
          const newThumbnailBlobId = crypto.randomUUID();

          await saveBlob(newThumbnailBlobId, projectId, item.id, 'thumbnail', thumbnailBlob);
          if (oldThumbnailId) {
            await deleteBlob(oldThumbnailId);
          }

          updates.push({
            id: item.id,
            thumbnailBlobId: newThumbnailBlobId,
            camera: targetCameraState,
            shadingMode: currentShading,
            showEdges: currentEdges,
            colorHex: currentColor,
          });

          geometry.dispose();
        } catch (itemErr) {
          console.error(`Failed to batch apply to item ${item.id}`, itemErr);
        }
      }

      batchUpdateThumbnails(updates);

      setApplyAllSuccess(true);
      setTimeout(() => setApplyAllSuccess(false), 2500);
    } catch (err) {
      console.error('Apply to all failed', err);
    } finally {
      setIsApplyingAll(false);
    }
  };

  if (!selectedItemId || !selectedItem) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center select-none bg-white">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
          <Eye className="w-8 h-8 stroke-1.5" />
        </div>
        <p className="font-extrabold text-slate-800 text-sm">선택된 상품이 없습니다</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed font-medium">
          왼쪽 목록에서 3D 뷰를 확인하거나 수정할 상품을 선택하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-slate-200 shrink-0 z-10">
        <div className="min-w-0 pr-4">
          <div className="flex items-center space-x-2">
            <h2 className="font-black text-slate-900 text-base truncate" title={selectedItem.displayName}>
              {selectedItem.displayName}
            </h2>
          </div>

          <div className="flex items-center space-x-2.5 mt-0.5 text-xs text-slate-600 font-semibold">
            <span className="truncate max-w-[160px] text-slate-800" title={selectedItem.source.name}>
              {selectedItem.source.name}
            </span>
            {selectedItem.bounds && (
              <>
                <span className="text-slate-300">•</span>
                <span className="flex items-center space-x-1 text-slate-700 font-bold">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {selectedItem.bounds.width} × {selectedItem.bounds.depth} × {selectedItem.bounds.height} mm
                  </span>
                </span>
              </>
            )}
            {selectedItem.triangleCount && (
              <>
                <span className="text-slate-300">•</span>
                <span className="flex items-center space-x-1 text-slate-700 font-bold">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedItem.triangleCount.toLocaleString()} facets</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons: Apply Current View + Batch Apply to All */}
        <div className="flex items-center space-x-2 shrink-0">
          {items.length > 1 && (
            <button
              onClick={handleApplyToAll}
              disabled={isApplyingAll || loadingModel || selectedItem.status !== 'ready'}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white disabled:bg-slate-200 disabled:text-slate-400 rounded-lg text-xs font-black transition cursor-pointer shadow-xs"
              title="현재 카메라 각도, 셰이딩 스타일, 색상, 외곽선 설정을 등록된 모든 상품에 일괄 적용합니다"
            >
              {isApplyingAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>일괄 적용 중 ({applyAllProgress.current}/{applyAllProgress.total})</span>
                </>
              ) : applyAllSuccess ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>전체 적용 완료!</span>
                </>
              ) : (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>모든 상품에 일괄 적용</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleSaveCurrentView}
            disabled={isApplyingAll || loadingModel || selectedItem.status !== 'ready'}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 border border-indigo-200 text-indigo-700 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 rounded-lg text-xs font-extrabold transition cursor-pointer shadow-2xs"
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>적용 완료!</span>
              </>
            ) : (
              <>
                <RotateCw className="w-3.5 h-3.5 text-indigo-600" />
                <span>현재 보기 적용</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-white">
        {/* Top 3D Interactive Canvas */}
        <div ref={containerRef} className="flex-1 relative w-full min-h-[220px] bg-white border-b border-slate-200">
          <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing outline-none" />

          {/* Loading Overlay */}
          {loadingModel && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-2xs z-20">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
              <p className="text-xs font-bold text-slate-800">3D 모델 렌더링 중...</p>
            </div>
          )}

          {/* Error Overlay */}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20 p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-rose-500 mb-2" />
              <p className="text-sm font-bold text-slate-900">모델을 표시할 수 없습니다</p>
              <p className="text-xs text-rose-600 mt-1 font-semibold">{loadError}</p>
            </div>
          )}

          {/* Top-Left: Turntable Slider & Shading & 10 Distinct Primary Colors */}
          {selectedItem.status === 'ready' && !loadingModel && (
            <div className="absolute top-3 left-4 flex flex-wrap items-center gap-2 z-10 max-w-[calc(100%-32px)]">
              {/* 1. Turntable Slider */}
              <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm shrink-0">
                <div className="flex items-center space-x-1 text-xs font-extrabold text-slate-800">
                  <Compass className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>수평 회전</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={turntableAngle}
                  onChange={(e) => handleSliderChange(parseInt(e.target.value, 10))}
                  className="w-18 sm:w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  title="슬라이더로 수평 360도 회전"
                />
                <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md min-w-[32px] text-center">
                  {turntableAngle}°
                </span>
              </div>

              {/* 2. Outline Edges Toggle Button */}
              <button
                onClick={handleToggleEdges}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer shadow-sm shrink-0 ${
                  showEdges
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
                title="3D 형상 모서리 외곽선 라인을 켜거나 끕니다"
              >
                <SquareDashedKanban className="w-3.5 h-3.5" />
                <span>외곽선 {showEdges ? 'ON' : 'OFF'}</span>
              </button>

              {/* 3. Shading Style Selector */}
              <div className="flex items-center space-x-1 bg-white/95 backdrop-blur-md p-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                <Palette className="w-3.5 h-3.5 text-slate-500 ml-1 mr-0.5" />
                <button
                  onClick={() => handleShadingChange('technical')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    shadingMode === 'technical'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="CAD 기술 도면 스타일"
                >
                  CAD
                </button>
                <button
                  onClick={() => handleShadingChange('clay')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    shadingMode === 'clay'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="무광 클레이 스타일"
                >
                  클레이
                </button>
                <button
                  onClick={() => handleShadingChange('metallic')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md transition cursor-pointer ${
                    shadingMode === 'metallic'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title="고대비 메탈릭 스타일"
                >
                  메탈
                </button>
              </div>

              {/* 4. 10 Distinct Primary Colors */}
              <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                <span className="text-[11px] font-black text-slate-700 mx-0.5 shrink-0">색상:</span>
                {COLOR_PALETTE.map((c) => {
                  const isSelected = selectedColorHex === c.hex;
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleColorChange(c.hex)}
                      className={`group flex flex-col items-center justify-center px-1.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border border-indigo-500 shadow-2xs ring-1 ring-indigo-400/40'
                          : 'hover:bg-slate-100 border border-transparent'
                      }`}
                      title={`${c.name} (${c.cssColor})`}
                    >
                      {/* Color Swatch Circle */}
                      <div
                        className="w-4 h-4 rounded-full border border-slate-400/60 shadow-2xs flex items-center justify-center relative transition group-hover:scale-110"
                        style={{ backgroundColor: c.cssColor }}
                      >
                        {isSelected && (
                          <Check
                            className={`w-2.5 h-2.5 stroke-[3.5] ${
                              c.id === 'white' || c.id === 'default' || c.id === 'yellow'
                                ? 'text-slate-900'
                                : 'text-white'
                            }`}
                          />
                        )}
                      </div>

                      {/* Clear Color Name Label */}
                      <span
                        className={`text-[9.5px] font-black leading-tight mt-0.5 ${
                          isSelected ? 'text-indigo-700 underline underline-offset-1' : 'text-slate-700'
                        }`}
                      >
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom 9-Angle Rendered Photo Gallery */}
        <div className="h-[210px] min-h-[190px] bg-slate-50 p-3 flex flex-col shrink-0 overflow-hidden border-t border-slate-200">
          <div className="flex items-center justify-between mb-2 px-1 shrink-0">
            <div className="flex items-center space-x-1.5 text-xs font-black text-slate-900">
              <Camera className="w-4 h-4 text-indigo-600" />
              <span>추천 3D 촬영 각도 (클릭 시 즉시 적용)</span>
            </div>
            <span className="text-[11px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
              클릭 즉시 인쇄물에 반영
            </span>
          </div>

          {/* 9 Rendered Cards Grid */}
          <div className="flex-1 grid grid-cols-9 gap-2 overflow-x-auto overflow-y-hidden pb-1 items-stretch">
            {PRESET_OPTIONS.map((opt) => {
              const isActive = activePreset === opt.id;
              const thumbDataUrl = presetThumbnails[opt.id];

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectPreset(opt.id)}
                  className={`group flex flex-col p-1.5 rounded-xl transition-all cursor-pointer overflow-hidden text-left relative ${
                    isActive
                      ? 'border-2 border-indigo-600 bg-indigo-50/50 shadow-sm ring-2 ring-indigo-500/20 scale-[1.02]'
                      : 'border border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-2xs'
                  }`}
                  title={`${opt.label} (${opt.description})`}
                >
                  {/* 3D Rendered Image Box */}
                  <div className="w-full flex-1 min-h-[85px] rounded-lg bg-slate-100/70 border border-slate-200/60 flex items-center justify-center overflow-hidden relative mb-1.5">
                    {thumbDataUrl ? (
                      <img
                        src={thumbDataUrl}
                        alt={opt.label}
                        className="w-full h-full object-contain bg-white group-hover:scale-105 transition duration-150"
                      />
                    ) : (
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    )}

                    {/* Active Checked Badge */}
                    {isActive && (
                      <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5 shadow-xs z-10">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}

                    {/* Best Angle Sparkle */}
                    {!isActive && opt.id === 'iso-front-right' && (
                      <div className="absolute top-1 right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-xs" title="추천 기본 각도">
                        <Sparkles className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {/* Caption & Category */}
                  <div className="shrink-0 px-0.5">
                    <span className={`block text-[11px] font-black truncate leading-tight ${isActive ? 'text-indigo-700' : 'text-slate-900'}`}>
                      {opt.label}
                    </span>
                    <span className="block text-[10px] text-slate-600 font-semibold truncate mt-0.5">
                      {opt.category}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

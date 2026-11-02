import * as THREE from 'three';
import occtimportjs from 'occt-import-js';
import { SplitChoice, ParsedPartMesh, ModelInspectionResult } from '../threemf/threemfParser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let occtInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let occtLoadingPromise: Promise<any> | null = null;

// Temporary cache for inspected STEP files to prevent duplicate WASM tessellation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stepInspectionCache = new Map<number, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOcct(): Promise<any> {
  if (occtInstance) return occtInstance;
  if (occtLoadingPromise) return occtLoadingPromise;

  occtLoadingPromise = occtimportjs({
    locateFile: (name: string) => {
      if (name.endsWith('.wasm')) {
        return '/occt-import-js.wasm';
      }
      return name;
    },
  }).then((instance: unknown) => {
    occtInstance = instance;
    return instance;
  });

  return occtLoadingPromise;
}

// Fast & High-Quality CAD Tessellation Parameters for 3D Product Sheet Generation
const FAST_TESSELLATION_PARAMS = {
  linearDeflection: 0.12,
  angularDeflection: 0.52,
};

/**
 * Pre-inspects a STEP file to check if it contains multiple bodies/components.
 * Caches the parsed OCCT mesh to eliminate duplicate parsing when user confirms.
 */
export async function inspectStep(arrayBuffer: ArrayBuffer): Promise<ModelInspectionResult> {
  try {
    const occt = await getOcct();
    const result = occt.ReadStepFile(new Uint8Array(arrayBuffer), FAST_TESSELLATION_PARAMS);

    if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
      return { hasMultipleParts: false, objectCount: 1, plateCount: 0, objectNames: [] };
    }

    // Cache the result for reuse by parseStepFile
    stepInspectionCache.set(arrayBuffer.byteLength, result);

    const objectNames: string[] = result.meshes.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any, idx: number) => m.name || `파트 ${idx + 1}`
    );

    return {
      hasMultipleParts: objectNames.length > 1,
      objectCount: objectNames.length,
      plateCount: 0,
      objectNames,
    };
  } catch (err) {
    console.error('STEP inspect failed', err);
    return { hasMultipleParts: false, objectCount: 1, plateCount: 0, objectNames: [] };
  }
}

/**
 * Parses a STEP file into BufferGeometry items according to user's SplitChoice.
 * Uses cached result if available for instant processing.
 */
export async function parseStepFile(
  arrayBuffer: ArrayBuffer,
  baseName: string,
  choice: SplitChoice = 'split-objects'
): Promise<ParsedPartMesh[]> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('EMPTY_FILE');
  }

  // Check inspection cache first for 0ms reuse
  let result = stepInspectionCache.get(arrayBuffer.byteLength);
  if (result) {
    stepInspectionCache.delete(arrayBuffer.byteLength);
  } else {
    const occt = await getOcct();
    result = occt.ReadStepFile(new Uint8Array(arrayBuffer), FAST_TESSELLATION_PARAMS);
  }

  if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
    throw new Error('EMPTY_GEOMETRY');
  }

  // Convert each OCCT mesh to Three.js BufferGeometry
  const meshGeometries: { name: string; geometry: THREE.BufferGeometry }[] = [];

  for (let i = 0; i < result.meshes.length; i++) {
    const m = result.meshes[i];
    const posArray = new Float32Array(m.attributes.position.array);
    const indexArray = new Uint32Array(m.index.array);

    if (posArray.length === 0 || indexArray.length === 0) continue;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geom.setIndex(new THREE.BufferAttribute(indexArray, 1));

    if (m.attributes.normal && m.attributes.normal.array.length > 0) {
      geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(m.attributes.normal.array), 3));
    } else {
      geom.computeVertexNormals();
    }

    meshGeometries.push({
      name: m.name || `부품 ${i + 1}`,
      geometry: geom,
    });
  }

  if (meshGeometries.length === 0) {
    throw new Error('EMPTY_GEOMETRY');
  }

  const standardize = (geom: THREE.BufferGeometry): {
    geometry: THREE.BufferGeometry;
    triangleCount: number;
    bounds: { width: number; depth: number; height: number };
    boundingSphereRadius: number;
  } => {
    // Keep indexed buffer for 3x less memory and faster rendering
    const flat = geom.clone();
    flat.computeVertexNormals();
    flat.rotateX(-Math.PI / 2); // Align Z-Up CAD to Y-Up
    flat.center();
    flat.computeBoundingBox();
    flat.computeBoundingSphere();

    const size = new THREE.Vector3();
    flat.boundingBox!.getSize(size);
    const indexAttr = flat.getIndex();
    const posAttr = flat.getAttribute('position');
    const triangleCount = indexAttr ? indexAttr.count / 3 : posAttr ? posAttr.count / 3 : 0;

    return {
      geometry: flat,
      triangleCount: Math.round(triangleCount),
      bounds: {
        width: Number(size.x.toFixed(2)),
        depth: Number(size.z.toFixed(2)),
        height: Number(size.y.toFixed(2)),
      },
      boundingSphereRadius: flat.boundingSphere?.radius || Math.max(size.x, size.y, size.z) / 2,
    };
  };

  // Choice 1: Split into individual objects if multiple
  if (choice === 'split-objects' && meshGeometries.length > 1) {
    return meshGeometries.map((entry, idx) => {
      const std = standardize(entry.geometry);
      entry.geometry.dispose();
      const label = entry.name ? `${baseName} - ${entry.name}` : `${baseName} - 부품 ${idx + 1}`;

      return {
        partIndex: idx + 1,
        partName: label,
        geometry: std.geometry,
        triangleCount: std.triangleCount,
        bounds: std.bounds,
        boundingSphereRadius: std.boundingSphereRadius,
      };
    });
  }

  // Choice 2: Merge all into 1 assembly
  let totalPositions = 0;
  const flatMeshes: THREE.BufferGeometry[] = [];

  for (const entry of meshGeometries) {
    const flat = entry.geometry.index ? entry.geometry.toNonIndexed() : entry.geometry.clone();
    const posAttr = flat.getAttribute('position');
    if (posAttr) {
      flatMeshes.push(flat);
      totalPositions += posAttr.count * 3;
    }
    entry.geometry.dispose();
  }

  const mergedPositions = new Float32Array(totalPositions);
  let offset = 0;
  for (const flat of flatMeshes) {
    const posAttr = flat.getAttribute('position');
    if (posAttr) {
      const array = posAttr.array as Float32Array;
      mergedPositions.set(array, offset);
      offset += array.length;
    }
    flat.dispose();
  }

  const mergedGeom = new THREE.BufferGeometry();
  mergedGeom.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  const std = standardize(mergedGeom);
  mergedGeom.dispose();

  return [
    {
      partIndex: 1,
      partName: baseName,
      geometry: std.geometry,
      triangleCount: std.triangleCount,
      bounds: std.bounds,
      boundingSphereRadius: std.boundingSphereRadius,
    },
  ];
}

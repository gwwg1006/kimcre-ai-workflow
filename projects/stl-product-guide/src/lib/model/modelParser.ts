import * as THREE from 'three';
import { parseSTL, ParsedSTLResult } from '../stl/stlParser';
import {
  parse3MFWithOptions,
  inspect3MF,
  SplitChoice,
  ModelInspectionResult,
} from '../threemf/threemfParser';
import { parseStepFile, inspectStep } from '../step/stepParser';
import { extractDisplayName } from '../validation/validators';

export interface ModelParserResult {
  displayName: string;
  geometry: THREE.BufferGeometry;
  triangleCount: number;
  bounds: {
    width: number;
    depth: number;
    height: number;
  };
  boundingSphereRadius: number;
}

// In-memory LRU-like cache for parsed geometries to avoid re-parsing on every selection
const parsedModelCache = new Map<string, {
  results: {
    displayName: string;
    geometry: THREE.BufferGeometry;
    triangleCount: number;
    bounds: { width: number; depth: number; height: number };
    boundingSphereRadius: number;
  }[];
  timestamp: number;
}>();

const MAX_CACHE_ENTRIES = 20;

function getCacheKey(bufferLength: number, filename: string, choice: SplitChoice): string {
  return `${filename}_${bufferLength}_${choice}`;
}

/**
 * Cleans old cache entries if limit is reached
 */
function pruneCache() {
  if (parsedModelCache.size > MAX_CACHE_ENTRIES) {
    const sorted = Array.from(parsedModelCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = sorted.slice(0, 5);
    for (const [k, v] of toRemove) {
      v.results.forEach((r) => r.geometry.dispose());
      parsedModelCache.delete(k);
    }
  }
}

/**
 * Pre-inspects a 3D model file (STL, 3MF, STEP, STP) to check for multiple objects/plates.
 */
export async function inspectModelFile(arrayBuffer: ArrayBuffer, filename: string): Promise<ModelInspectionResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.3mf')) {
    return inspect3MF(arrayBuffer);
  }
  if (lower.endsWith('.step') || lower.endsWith('.stp')) {
    return inspectStep(arrayBuffer);
  }
  return { hasMultipleParts: false, objectCount: 1, plateCount: 0, objectNames: [] };
}

/**
 * Universal 3D Model Parser supporting STL, 3MF, and STEP/STP files with split choice and memory caching.
 */
export async function parseModelFile(
  arrayBuffer: ArrayBuffer,
  filename: string,
  choice: SplitChoice = 'split-objects'
): Promise<ModelParserResult[]> {
  const cacheKey = getCacheKey(arrayBuffer.byteLength, filename, choice);
  const cached = parsedModelCache.get(cacheKey);

  if (cached) {
    cached.timestamp = Date.now();
    // Return cloned geometries so each caller can safely manage their own lifecycle
    return cached.results.map((r) => ({
      ...r,
      geometry: r.geometry.clone(),
    }));
  }

  const lower = filename.toLowerCase();
  let results: ModelParserResult[] = [];

  // 1. STEP / STP CAD format
  if (lower.endsWith('.step') || lower.endsWith('.stp')) {
    const baseName = extractDisplayName(filename);
    const parts = await parseStepFile(arrayBuffer, baseName, choice);

    results = parts.map((p) => ({
      displayName: p.partName,
      geometry: p.geometry,
      triangleCount: p.triangleCount,
      bounds: p.bounds,
      boundingSphereRadius: p.boundingSphereRadius,
    }));
  }
  // 2. 3MF format
  else if (lower.endsWith('.3mf')) {
    const baseName = extractDisplayName(filename);
    const parts = parse3MFWithOptions(arrayBuffer, baseName, choice);

    results = parts.map((p) => ({
      displayName: p.partName,
      geometry: p.geometry,
      triangleCount: p.triangleCount,
      bounds: p.bounds,
      boundingSphereRadius: p.boundingSphereRadius,
    }));
  }
  // 3. Default: STL parser
  else {
    const stlResult: ParsedSTLResult = parseSTL(arrayBuffer);
    results = [
      {
        displayName: extractDisplayName(filename),
        geometry: stlResult.geometry,
        triangleCount: stlResult.triangleCount,
        bounds: stlResult.bounds,
        boundingSphereRadius: stlResult.boundingSphereRadius,
      },
    ];
  }

  // Save cloned copies in memory cache
  pruneCache();
  parsedModelCache.set(cacheKey, {
    results: results.map((r) => ({
      ...r,
      geometry: r.geometry.clone(),
    })),
    timestamp: Date.now(),
  });

  return results;
}

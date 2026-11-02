import * as THREE from 'three';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import * as fflate from 'fflate';

export type SplitChoice = 'split-objects' | 'split-plates' | 'merge-all';

export interface ParsedPartMesh {
  partIndex: number;
  partName: string;
  geometry: THREE.BufferGeometry;
  triangleCount: number;
  bounds: {
    width: number;
    depth: number;
    height: number;
  };
  boundingSphereRadius: number;
}

export interface ModelInspectionResult {
  hasMultipleParts: boolean;
  objectCount: number;
  plateCount: number;
  objectNames: string[];
}

const threeMFLoader = new ThreeMFLoader();

// Helper to find all elements by local tag name ignoring any XML namespaces
function getElementsByLocalName(parent: Document | Element, localName: string): Element[] {
  const result: Element[] = [];
  const target = localName.toLowerCase();
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.localName.toLowerCase() === target || el.nodeName.toLowerCase().endsWith(':' + target)) {
      result.push(el);
    }
  }
  return result;
}

// Safely merge multiple geometries (handles indexed, non-indexed, transforms) without offset out of bounds errors
export function mergeAndStandardizeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!geometries || geometries.length === 0) {
    throw new Error('EMPTY_GEOMETRY');
  }

  // 1. Convert all geometries to non-indexed first so vertex counts match 100%
  const flatGeometries: THREE.BufferGeometry[] = [];
  let totalPositions = 0;

  for (const g of geometries) {
    if (!g) continue;
    const flat = g.index ? g.toNonIndexed() : g.clone();
    const posAttr = flat.getAttribute('position');
    if (posAttr && posAttr.count > 0) {
      flatGeometries.push(flat);
      totalPositions += posAttr.count * 3;
    } else {
      flat.dispose();
    }
  }

  if (flatGeometries.length === 0 || totalPositions === 0) {
    throw new Error('EMPTY_GEOMETRY');
  }

  // 2. Allocate exact flat Float32Array
  const mergedPositions = new Float32Array(totalPositions);
  let offset = 0;

  for (const g of flatGeometries) {
    const posAttr = g.getAttribute('position');
    if (posAttr) {
      const array = posAttr.array as Float32Array;
      mergedPositions.set(array, offset);
      offset += array.length;
    }
    g.dispose();
  }

  const mergedGeom = new THREE.BufferGeometry();
  mergedGeom.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
  mergedGeom.computeVertexNormals();

  // 3MF standard is Z-Up in 3D printers; rotate -90 deg around X to Three.js Y-Up and center
  mergedGeom.rotateX(-Math.PI / 2);
  mergedGeom.center();
  mergedGeom.computeBoundingBox();
  mergedGeom.computeBoundingSphere();

  return mergedGeom;
}

/**
 * Inspects a 3MF file to check if it contains multiple objects or plates before loading.
 */
export function inspect3MF(arrayBuffer: ArrayBuffer): ModelInspectionResult {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return { hasMultipleParts: false, objectCount: 0, plateCount: 0, objectNames: [] };
  }

  try {
    const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));
    let modelXmlContent: string | null = null;
    let plateCount = 0;

    // Check plates in slicer configs
    for (const filename of Object.keys(unzipped)) {
      if (filename.toLowerCase().endsWith('3dmodel.model') || filename.toLowerCase().endsWith('.model')) {
        modelXmlContent = fflate.strFromU8(unzipped[filename]);
      }
      if (
        filename.includes('slice_info') ||
        filename.includes('model_settings') ||
        filename.includes('plate_') ||
        filename.includes('project_settings')
      ) {
        try {
          const configText = fflate.strFromU8(unzipped[filename]);
          const plateMatches = Array.from(configText.matchAll(/<plate[^>]*>/gi));
          if (plateMatches.length > plateCount) {
            plateCount = plateMatches.length;
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!modelXmlContent) {
      return { hasMultipleParts: false, objectCount: 1, plateCount, objectNames: [] };
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(modelXmlContent, 'application/xml');
    const objectNodes = getElementsByLocalName(xmlDoc, 'object');

    const objectNames: string[] = [];
    for (const objNode of objectNodes) {
      const meshNodes = getElementsByLocalName(objNode, 'mesh');
      if (meshNodes.length > 0) {
        const name = objNode.getAttribute('name') || objNode.getAttribute('partnumber') || `오브젝트 ${objectNames.length + 1}`;
        objectNames.push(name);
      }
    }

    const objectCount = objectNames.length;
    const hasMultipleParts = objectCount > 1 || plateCount > 1;

    return {
      hasMultipleParts,
      objectCount,
      plateCount,
      objectNames,
    };
  } catch {
    return { hasMultipleParts: false, objectCount: 1, plateCount: 0, objectNames: [] };
  }
}

/**
 * Parses 3MF according to user's choice:
 * - 'split-objects': splits each 3MF <object> into an individual part
 * - 'split-plates': splits by slicer plates (Plate 1, Plate 2...)
 * - 'merge-all': merges everything into 1 single assembly
 */
export function parse3MFWithOptions(
  arrayBuffer: ArrayBuffer,
  baseName: string,
  choice: SplitChoice = 'split-objects'
): ParsedPartMesh[] {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('EMPTY_FILE');
  }

  let unzipped: fflate.Unzipped | null = null;
  const plateToObjectNameMap = new Map<number, Set<string>>();

  try {
    unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));

    for (const filename of Object.keys(unzipped)) {
      if (
        filename.includes('slice_info') ||
        filename.includes('model_settings') ||
        filename.includes('plate_') ||
        filename.includes('project_settings')
      ) {
        try {
          const configText = fflate.strFromU8(unzipped[filename]);
          const plateMatches = configText.matchAll(/<plate[^>]*>([\s\S]*?)<\/plate>/gi);
          let pIdx = 1;
          for (const match of plateMatches) {
            const plateBody = match[1];
            const objMatches = plateBody.matchAll(/<object[^>]*id="(\d+)"[^>]*name="([^"]*)"/gi);
            for (const objMatch of objMatches) {
              const name = objMatch[2];
              if (!plateToObjectNameMap.has(pIdx)) {
                plateToObjectNameMap.set(pIdx, new Set());
              }
              plateToObjectNameMap.get(pIdx)!.add(name.toLowerCase());
            }

            const idMatches = plateBody.matchAll(/<object[^>]*id="(\d+)"/gi);
            for (const idMatch of idMatches) {
              const id = idMatch[1];
              if (!plateToObjectNameMap.has(pIdx)) {
                plateToObjectNameMap.set(pIdx, new Set());
              }
              plateToObjectNameMap.get(pIdx)!.add(id);
            }
            pIdx++;
          }
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Continue
  }

  // 1. Try ThreeMFLoader
  let loadedGroup: THREE.Group | null = null;
  try {
    loadedGroup = threeMFLoader.parse(arrayBuffer);
  } catch {
    loadedGroup = null;
  }

  // If ThreeMFLoader worked, extract named meshes
  if (loadedGroup) {
    loadedGroup.updateMatrixWorld(true);
    const meshEntries: { id: string; name: string; geometry: THREE.BufferGeometry }[] = [];

    loadedGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          const clonedGeom = mesh.geometry.clone();
          clonedGeom.applyMatrix4(mesh.matrixWorld);
          meshEntries.push({
            id: mesh.uuid,
            name: mesh.name || `부품 ${meshEntries.length + 1}`,
            geometry: clonedGeom,
          });
        }
      }
    });

    if (meshEntries.length > 0) {
      // Choice 1: Split by individual objects
      if (choice === 'split-objects' && meshEntries.length > 1) {
        return meshEntries.map((entry, idx) => {
          const standardized = mergeAndStandardizeGeometries([entry.geometry]);
          const posAttr = standardized.getAttribute('position');
          const triangleCount = posAttr.count / 3;
          standardized.computeBoundingBox();
          const size = new THREE.Vector3();
          standardized.boundingBox!.getSize(size);

          const partLabel = entry.name ? `${baseName} - ${entry.name}` : `${baseName} - 부품 ${idx + 1}`;

          return {
            partIndex: idx + 1,
            partName: partLabel,
            geometry: standardized,
            triangleCount: Math.round(triangleCount),
            bounds: {
              width: Number(size.x.toFixed(2)),
              depth: Number(size.z.toFixed(2)),
              height: Number(size.y.toFixed(2)),
            },
            boundingSphereRadius: standardized.boundingSphere?.radius || Math.max(size.x, size.y, size.z) / 2,
          };
        });
      }

      // Choice 2: Split by slicer plates
      if (choice === 'split-plates' && plateToObjectNameMap.size > 1) {
        const results: ParsedPartMesh[] = [];
        const plateIndices = Array.from(plateToObjectNameMap.keys()).sort((a, b) => a - b);

        for (let i = 0; i < plateIndices.length; i++) {
          const pIdx = plateIndices[i];
          const matchSet = plateToObjectNameMap.get(pIdx)!;
          const plateGeoms: THREE.BufferGeometry[] = [];

          for (const entry of meshEntries) {
            if (matchSet.has(entry.name.toLowerCase()) || matchSet.size === 0) {
              plateGeoms.push(entry.geometry);
            }
          }

          if (plateGeoms.length > 0) {
            const standardized = mergeAndStandardizeGeometries(plateGeoms);
            const posAttr = standardized.getAttribute('position');
            const triangleCount = posAttr.count / 3;
            standardized.computeBoundingBox();
            const size = new THREE.Vector3();
            standardized.boundingBox!.getSize(size);

            results.push({
              partIndex: i + 1,
              partName: `${baseName} - Plate ${i + 1}`,
              geometry: standardized,
              triangleCount: Math.round(triangleCount),
              bounds: {
                width: Number(size.x.toFixed(2)),
                depth: Number(size.z.toFixed(2)),
                height: Number(size.y.toFixed(2)),
              },
              boundingSphereRadius: standardized.boundingSphere?.radius || Math.max(size.x, size.y, size.z) / 2,
            });
          }
        }
        if (results.length > 0) return results;
      }

      // Choice 3: Merge all into 1 assembly
      const allGeoms = meshEntries.map((e) => e.geometry);
      const standardized = mergeAndStandardizeGeometries(allGeoms);
      const posAttr = standardized.getAttribute('position');
      const triangleCount = posAttr.count / 3;
      standardized.computeBoundingBox();
      const size = new THREE.Vector3();
      standardized.boundingBox!.getSize(size);

      return [
        {
          partIndex: 1,
          partName: baseName,
          geometry: standardized,
          triangleCount: Math.round(triangleCount),
          bounds: {
            width: Number(size.x.toFixed(2)),
            depth: Number(size.z.toFixed(2)),
            height: Number(size.y.toFixed(2)),
          },
          boundingSphereRadius: standardized.boundingSphere?.radius || Math.max(size.x, size.y, size.z) / 2,
        },
      ];
    }
  }

  // Fallback direct XML parser if ThreeMFLoader failed or produced 0 meshes
  if (unzipped) {
    let modelXmlContent: string | null = null;
    for (const filename of Object.keys(unzipped)) {
      if (filename.toLowerCase().endsWith('3dmodel.model') || filename.toLowerCase().endsWith('.model')) {
        modelXmlContent = fflate.strFromU8(unzipped[filename]);
        break;
      }
    }

    if (!modelXmlContent) throw new Error('EMPTY_GEOMETRY');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(modelXmlContent, 'application/xml');
    const objectNodes = getElementsByLocalName(xmlDoc, 'object');
    const objectList: { id: string; name: string; geometry: THREE.BufferGeometry }[] = [];

    for (const objNode of objectNodes) {
      const objId = objNode.getAttribute('id') || `obj-${objectList.length + 1}`;
      const objName = objNode.getAttribute('name') || '';
      const meshNodes = getElementsByLocalName(objNode, 'mesh');
      if (meshNodes.length === 0) continue;

      const positions: number[] = [];
      for (const meshNode of meshNodes) {
        const vertexNodes = getElementsByLocalName(meshNode, 'vertex');
        const triangleNodes = getElementsByLocalName(meshNode, 'triangle');

        const vertices: number[] = [];
        for (let i = 0; i < vertexNodes.length; i++) {
          const v = vertexNodes[i];
          vertices.push(
            parseFloat(v.getAttribute('x') || '0'),
            parseFloat(v.getAttribute('y') || '0'),
            parseFloat(v.getAttribute('z') || '0')
          );
        }

        for (let i = 0; i < triangleNodes.length; i++) {
          const t = triangleNodes[i];
          const v1 = parseInt(t.getAttribute('v1') || '0', 10);
          const v2 = parseInt(t.getAttribute('v2') || '0', 10);
          const v3 = parseInt(t.getAttribute('v3') || '0', 10);

          const v1Idx = v1 * 3;
          const v2Idx = v2 * 3;
          const v3Idx = v3 * 3;

          if (v1Idx + 2 < vertices.length && v2Idx + 2 < vertices.length && v3Idx + 2 < vertices.length) {
            positions.push(
              vertices[v1Idx], vertices[v1Idx + 1], vertices[v1Idx + 2],
              vertices[v2Idx], vertices[v2Idx + 1], vertices[v2Idx + 2],
              vertices[v3Idx], vertices[v3Idx + 1], vertices[v3Idx + 2]
            );
          }
        }
      }

      if (positions.length > 0) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        objectList.push({
          id: objId,
          name: objName || `부품 ${objectList.length + 1}`,
          geometry: geom,
        });
      }
    }

    if (objectList.length === 0) throw new Error('EMPTY_GEOMETRY');

    if (choice === 'split-objects' && objectList.length > 1) {
      return objectList.map((obj, idx) => {
        const standardized = mergeAndStandardizeGeometries([obj.geometry]);
        const posAttr = standardized.getAttribute('position');
        const triangleCount = posAttr.count / 3;
        standardized.computeBoundingBox();
        const size = new THREE.Vector3();
        standardized.boundingBox!.getSize(size);

        const partLabel = obj.name ? `${baseName} - ${obj.name}` : `${baseName} - 부품 ${idx + 1}`;

        return {
          partIndex: idx + 1,
          partName: partLabel,
          geometry: standardized,
          triangleCount: Math.round(triangleCount),
          bounds: {
            width: Number(size.x.toFixed(2)),
            depth: Number(size.z.toFixed(2)),
            height: Number(size.y.toFixed(2)),
          },
          boundingSphereRadius: standardized.boundingSphere?.radius || Math.max(size.x, size.y, size.z) / 2,
        };
      });
    }

    const allGeoms = objectList.map((o) => o.geometry);
    const standardized = mergeAndStandardizeGeometries(allGeoms);
    const posAttr = standardized.getAttribute('position');
    const triangleCount = posAttr.count / 3;
    standardized.computeBoundingBox();
    const size = new THREE.Vector3();
    standardized.boundingBox!.getSize(size);

    return [
      {
        partIndex: 1,
        partName: baseName,
        geometry: standardized,
        triangleCount: Math.round(triangleCount),
        bounds: {
          width: Number(size.x.toFixed(2)),
          depth: Number(size.z.toFixed(2)),
          height: Number(size.y.toFixed(2)),
        },
        boundingSphereRadius: standardized.boundingSphere?.radius || Math.max(size.x, size.y, size.z) / 2,
      },
    ];
  }

  throw new Error('EMPTY_GEOMETRY');
}

// Backward-compatible alias
export const parse3MF = (arrayBuffer: ArrayBuffer, baseName: string) =>
  parse3MFWithOptions(arrayBuffer, baseName, 'split-objects');
